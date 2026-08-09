import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Grupp, Karta as KartaTyp, Produkt } from './lib/typer'
import { palett } from './lib/färg'
import { useSmalSkärm } from './lib/skarm'

const W = 1000
const H = 700
const MARGINAL = 60

const MIN_SKALA = 0.6
const MAX_SKALA = 14
/* Tidskonstant för glidet, i millisekunder. Lägre är snabbare och hårdare.
   Runt 110 ms känns det som att vyn har vikt utan att släpa efter. */
const TRÖGHET = 110

type Vy = { k: number; tx: number; ty: number }

/* Hur långt förbi innehållets kant man får dra, som andel av vyn. Utan gräns
   kan man panorera ut i det svarta tills prickarna försvinner helt och det
   inte längre går att hitta tillbaka. Lite slack behövs ändå — en prick i
   kanten ska gå att få fri från panelen.

   Kanten är innehållets, inte ritytans. Stilarna spänner upp ritytan, men de
   är medelvärden och ölen ligger runt omkring dem: 293 hamnar helt utanför.
   Mättes gränsen mot ritytan gick de inte att flyga till — sökningen bad om
   en förflyttning som gränsen klippte, och ölen hamnade utanför bild. */
const SLACK = 0.3

/* Ritytan är 1000×700 och skalas in i elementet med `meet`, alltså efter den
   knappaste sidan. Bredvid en öppen panel på en 1440-skärm blir en ritenhet
   1,06 skärmpunkter — på en telefon 0,41, eftersom bredden är 412 punkter.
   Allt som anges i ritenheter ritades därför ut i en tredjedels storlek på
   telefonen: elva punkters text blev fyra, och gick inte att läsa.

   `lupp` räknar upp de mått som ska hålla sin storlek på skärmen oavsett var
   de visas. Referensen är skrivbordsläget, så där blir faktorn ett och
   ingenting ändras. */
const REFERENSFAKTOR = 1.06
const MAX_LUPP = 3

/* Prickarna behöver inte växa lika mycket som texten. En text under elva
   punkter går inte att läsa; en prick på tio går utmärkt att träffa. Följde de
   luppen fullt ut skulle de äta upp telefonskärmen — kartan blev en samling
   bollar. Golvet finns för motsatta skälet: en stil med tre öl ritas som fyra
   ritenheter, vilket är ett par punkter, och det går inte att peka på. */
const PRICKANDEL = 0.6
const MINSTA_PRICK_PUNKTER = 7

/** Innehållets ytterkanter i ritenheter — det som gränsen mäts emot. */
type Ruta = { x0: number; x1: number; y0: number; y1: number }

function begränsa(v: Vy, g: Ruta): Vy {
  const spann = (vyLängd: number, c0: number, c1: number) => {
    const slack = vyLängd * SLACK
    const a = vyLängd - slack - c1 * v.k
    const b = slack - c0 * v.k
    return [Math.min(a, b), Math.max(a, b)] as const
  }
  const [minX, maxX] = spann(W, g.x0, g.x1)
  const [minY, maxY] = spann(H, g.y0, g.y1)
  return {
    k: v.k,
    tx: Math.min(Math.max(v.tx, minX), maxX),
    ty: Math.min(Math.max(v.ty, minY), maxY),
  }
}

export type KartHandtag = {
  /** Centrera en punkt i datakoordinater, med mjuk inflygning. */
  flygTill: (x: number, y: number, skala?: number) => void
  /** Rama in en samling punkter så att alla precis får plats. */
  rymPunkter: (punkter: { x: number; y: number }[]) => void
}

type Props = {
  karta: KartaTyp
  vald: string | null
  /** Produkterna som ska ritas ut som ett moln. En grupps produkter, eller
   *  träffarna på ett smakord — kartan bryr sig inte om vilket. */
  molnet: Produkt[]
  valdProdukt: Produkt | null
  onVälj: (g: Grupp) => void
  onVäljProdukt: (p: Produkt) => void
}

const Karta = forwardRef<KartHandtag, Props>(function Karta(
  { karta, vald, molnet, valdProdukt, onVälj, onVäljProdukt },
  ref,
) {
  const grupper = karta.grupper
  const kulör = palett(karta.färgskala)
  // Axelorden är långa — 'sirapslimpa, pomerans, choklad' tar halva bredden
  // på en telefon. På smal skärm räcker det tyngsta ordet åt varje håll.
  const smal = useSmalSkärm('(max-width: 700px)')
  const svgRef = useRef<SVGSVGElement>(null)
  const [ritfaktor, setRitfaktor] = useState(REFERENSFAKTOR)
  const [vy, setVy] = useState<Vy>({ k: 1, tx: 0, ty: 0 })
  const [hovrad, setHovrad] = useState<Grupp | null>(null)
  const [hovradProdukt, setHovradProdukt] = useState<Produkt | null>(null)
  const [pekare, setPekare] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; rörd: boolean } | null>(null)
  /* Alla fingrar som rör skärmen, och nypet de eventuellt utför. */
  const fingrar = useRef(new Map<number, { x: number; y: number }>())
  const nyp = useRef<{
    avstånd: number
    k: number
    innehåll: { x: number; y: number }
  } | null>(null)

  /* Vyn finns i tre exemplar med olika uppgifter: `vy` är den som ritas,
     `vyNu` är samma värde läsbart utan att stänga in det i en callback, och
     `mål` är dit vi är på väg. Glidet mellan de två sista är hela effekten. */
  const vyNu = useRef(vy)
  const mål = useRef(vy)
  const bild = useRef<number | null>(null)
  const sistaTid = useRef(0)

  const lupp = Math.min(MAX_LUPP, Math.max(1, REFERENSFAKTOR / ritfaktor))
  const luppPrick = 1 + (lupp - 1) * PRICKANDEL
  const prickgolv = lupp > 1.4 ? MINSTA_PRICK_PUNKTER / ritfaktor : 0

  /** Ett mått i skärmpunkter, uttryckt i ritenheter vid nuvarande zoom. */
  const sk = useCallback((n: number) => (n * lupp) / vy.k, [lupp, vy.k])
  /** Detsamma för prickarnas radie, som växer försiktigare. */
  const skPrick = (r: number) => (r * luppPrick) / vy.k
  /** Stilprickarna har dessutom ett golv, så att en stil med tre öl går att
   *  peka på. Molnets prickar får inte det — fyrahundra öl med fingerstora
   *  prickar blir en enda klump. */
  const skStil = useCallback(
    (r: number) => Math.max(r * luppPrick, prickgolv) / vy.k,
    [luppPrick, prickgolv, vy.k],
  )

  const sätt = useCallback((v: Vy) => {
    vyNu.current = v
    setVy(v)
  }, [])

  const animera = useCallback(() => {
    if (bild.current !== null) return
    sistaTid.current = performance.now()
    const steg = (nu: number) => {
      const dt = Math.min(64, nu - sistaTid.current)
      sistaTid.current = nu
      const v = vyNu.current
      const m = mål.current
      const dk = m.k - v.k
      const dx = m.tx - v.tx
      const dy = m.ty - v.ty
      // Nära nog: snäpp till målet och sluta rita om.
      if (Math.abs(dk) < 0.0004 && Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) {
        bild.current = null
        sätt(m)
        return
      }
      // Exponentiell utjämning, korrigerad för bildfrekvens så att glidet tar
      // lika lång tid på en 60- som på en 144-hertzskärm.
      const f = 1 - Math.exp(-dt / TRÖGHET)
      sätt({ k: v.k + dk * f, tx: v.tx + dx * f, ty: v.ty + dy * f })
      bild.current = requestAnimationFrame(steg)
    }
    bild.current = requestAnimationFrame(steg)
  }, [sätt])

  useEffect(
    () => () => {
      if (bild.current !== null) cancelAnimationFrame(bild.current)
    },
    [],
  )

  /* Luppen följer elementets storlek, inte en mediefråga: det som avgör hur
     smått allt blir är hur många skärmpunkter ritytan får, och den krymper
     också när panelen tar plats bredvid. */
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const mät = () => {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      setRitfaktor(Math.min(r.width / W, r.height / H))
    }
    mät()
    const ro = new ResizeObserver(mät)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* Kartan är liggande, telefonen stående. Ryms hela ritytan i bredd blir den
     ett smalt band mitt på en svart skärm — två tredjedelar av telefonen
     oanvänd. Vid start zoomas den därför så att höjden fylls, och man
     panorerar i sidled i stället. På en bred skärm är faktorn nära ett och
     ingenting märks. */
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    const ryms = Math.min(r.width / W, r.height / H)
    const fyller = Math.max(r.width / W, r.height / H)
    const k = Math.min(MAX_SKALA, Math.max(1, (fyller / ryms) * 0.82))
    if (k <= 1.05) return
    // Rikta mot tyngdpunkten, inte mot ritytans geometriska mitt. Ölen ligger
    // inte jämnt fördelade — mitten av rutan är ett glest område, och en
    // startvy som pekar dit ser tom ut. Vikten är antalet öl per stil.
    let vikt = 0
    let cx = 0
    let cy = 0
    for (const punkt of punkter) {
      const v = punkt.grupp.antal
      vikt += v
      cx += punkt.px * v
      cy += punkt.py * v
    }
    if (vikt > 0) {
      cx /= vikt
      cy /= vikt
    } else {
      cx = W / 2
      cy = H / 2
    }
    const start = begränsa({ k, tx: W / 2 - cx * k, ty: H / 2 - cy * k }, gränser)
    mål.current = start
    sätt(start)
    // Punkterna behövs bara vid första ritningen; vyn ska inte hoppa om
    // filtret senare ändrar prickarnas storlek.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sätt])

  /* Datakoordinater → ritytan. Y vänds: PCA räknar uppåt, SVG nedåt. */
  const skala = useMemo(() => {
    const xs = grupper.map((g) => g.x)
    const ys = grupper.map((g) => g.y)
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const y0 = Math.min(...ys)
    const y1 = Math.max(...ys)
    const sx = (W - 2 * MARGINAL) / (x1 - x0)
    const sy = (H - 2 * MARGINAL) / (y1 - y0)
    return {
      px: (x: number) => MARGINAL + (x - x0) * sx,
      py: (y: number) => H - MARGINAL - (y - y0) * sy,
    }
  }, [grupper])

  /* Ytterkanterna som panoreringen mäts emot: ritytan, utvidgad med de öl som
     ligger utanför den. Y vänds på vägen — datans övre kant är ritytans nedre. */
  const gränser = useMemo<Ruta>(() => {
    const u = karta.utbredning
    return {
      x0: Math.min(0, skala.px(u.x0)),
      x1: Math.max(W, skala.px(u.x1)),
      y0: Math.min(0, skala.py(u.y1)),
      y1: Math.max(H, skala.py(u.y0)),
    }
  }, [skala, karta])

  const punkter = useMemo(() => {
    const maxAntal = Math.max(1, ...grupper.map((g) => g.antal))
    return grupper.map((g) => ({
      grupp: g,
      px: skala.px(g.x),
      py: skala.py(g.y),
      // Kvadratrot, inte linjärt: annars äter IPA upp halva kartan.
      r: 4 + 20 * Math.sqrt(g.antal / maxAntal),
      tom: g.antal === 0,
    }))
  }, [grupper, skala])

  /* De enskilda ölen i den valda stilen. Varje öl har en egen koordinat i
     samma rymd som stilarna — molnet visar hur brett stilen spretar, och att
     den överlappar sina grannar. */
  const molnpunkter = useMemo(
    () => molnet.map((p) => ({ produkt: p, px: skala.px(p.x), py: skala.py(p.y) })),
    [molnet, skala],
  )

  useImperativeHandle(
    ref,
    () => ({
      flygTill(x, y, önskad) {
        const k = Math.min(MAX_SKALA, Math.max(MIN_SKALA, önskad ?? Math.max(vyNu.current.k, 3)))
        mål.current = begränsa(
          { k, tx: W / 2 - skala.px(x) * k, ty: H / 2 - skala.py(y) * k },
          gränser,
        )
        animera()
      },
      rymPunkter(punkter) {
        if (!punkter.length) return
        const xs = punkter.map((p) => skala.px(p.x))
        const ys = punkter.map((p) => skala.py(p.y))
        const bredd = Math.max(1, Math.max(...xs) - Math.min(...xs))
        const höjd = Math.max(1, Math.max(...ys) - Math.min(...ys))
        // Marginalen ger prickarna i kanten luft, så att de inte klipps av.
        const k = Math.min(
          MAX_SKALA,
          Math.max(MIN_SKALA, Math.min((W - 140) / bredd, (H - 140) / höjd)),
        )
        const mx = (Math.min(...xs) + Math.max(...xs)) / 2
        const my = (Math.min(...ys) + Math.max(...ys)) / 2
        mål.current = begränsa({ k, tx: W / 2 - mx * k, ty: H / 2 - my * k }, gränser)
        animera()
      },
    }),
    [skala, animera, gränser],
  )

  /* Etiketter placeras girigt, störst stil först. En etikett måste vara fri
   * från både andra etiketter och alla prickar — annars hoppas den över och
   * dyker istället upp vid hover. Testet görs i skärmenheter, så fler
   * etiketter träder fram när man zoomar in. Det är meningen. */
  const etiketter = useMemo(() => {
    type Ruta = { x: number; y: number; w: number; h: number; ägare?: string }
    const upptaget: Ruta[] = punkter.map((p) => ({
      x: p.px - skStil(p.r),
      y: p.py - skStil(p.r),
      w: 2 * skStil(p.r),
      h: 2 * skStil(p.r),
      ägare: p.grupp.namn,
    }))
    const krockar = (a: Ruta, egen: string) =>
      upptaget.some(
        (q) =>
          q.ägare !== egen &&
          a.x < q.x + q.w &&
          a.x + a.w > q.x &&
          a.y < q.y + q.h &&
          a.y + a.h > q.y,
      )

    const höjd = sk(12)
    // Namn → baslinje för texten, så att ritningen använder exakt den plats
    // kollisionstestet godkände.
    const valda = new Map<string, number>()
    for (const p of [...punkter].sort((a, b) => b.grupp.antal - a.grupp.antal)) {
      const bredd = sk(p.grupp.namn.length * 5.6)
      // Under pricken, ovanför, och sist tvärs över den egna pricken. Det
      // tredje läget räddar de största stilarna, som ligger tätast och annars
      // blir de enda utan namn. Texten har mörk kontur och tål underlaget.
      const kandidater = [
        p.py + skStil(p.r) + sk(3),
        p.py - skStil(p.r) - sk(3) - höjd,
        p.py - höjd / 2,
      ]
      for (const y of kandidater) {
        const ruta = { x: p.px - bredd / 2, y, w: bredd, h: höjd, ägare: p.grupp.namn }
        if (krockar(ruta, p.grupp.namn)) continue
        upptaget.push(ruta)
        valda.set(p.grupp.namn, y + höjd * 0.8)
        break
      }
    }
    return valda
  }, [punkter, sk, skStil])

  const tillSvg = useCallback((e: { clientX: number; clientY: number }) => {
    const ctm = svgRef.current?.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }, [])

  /* React kopplar sina hjul-lyssnare som passiva, och då tystas
     preventDefault. Zoomen måste därför kopplas för hand för att inte
     samtidigt rulla sidan. Hjulet flyttar bara målet; glidet dit sköter
     animeringen, så ett ryck på hjulet blir en mjuk rörelse i stället för
     ett hopp. */
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    function hjul(e: globalThis.WheelEvent) {
      e.preventDefault()
      const { x, y } = tillSvg(e)
      const m = mål.current
      const k = Math.min(MAX_SKALA, Math.max(MIN_SKALA, m.k * Math.exp(-e.deltaY * 0.0022)))
      // Håll punkten under pekaren stilla medan skalan ändras.
      mål.current = begränsa(
        { k, tx: x - ((x - m.tx) * k) / m.k, ty: y - ((y - m.ty) * k) / m.k },
        gränser,
      )
      animera()
    }
    el.addEventListener('wheel', hjul, { passive: false })
    return () => el.removeEventListener('wheel', hjul)
  }, [tillSvg, animera, gränser])

  /** Avbryt en pågående inflygning — annars slåss den med fingret om vyn. */
  function stoppaGlid() {
    if (bild.current !== null) {
      cancelAnimationFrame(bild.current)
      bild.current = null
      mål.current = vyNu.current
    }
  }

  /* Nypet räknas ur två fingrar: förhållandet mellan fingrarnas avstånd nu
     och vid nypets början ger skalan, och punkten i innehållet som låg under
     mittpunkten hålls kvar där. Då blir zoom och tvåfingerpanorering samma
     rörelse, precis som man förväntar sig. */
  function startaNyp() {
    const [a, b] = [...fingrar.current.values()]
    const mitt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const v = vyNu.current
    nyp.current = {
      avstånd: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      k: v.k,
      // Mittpunkten uttryckt i innehållets koordinater, inte skärmens.
      innehåll: { x: (mitt.x - v.tx) / v.k, y: (mitt.y - v.ty) / v.k },
    }
    drag.current = null
  }

  function nedPekare(e: ReactPointerEvent<SVGSVGElement>) {
    const { x, y } = tillSvg(e)
    stoppaGlid()
    fingrar.current.set(e.pointerId, { x, y })

    if (fingrar.current.size === 2) {
      startaNyp()
    } else if (fingrar.current.size === 1) {
      drag.current = { x, y, tx: vyNu.current.tx, ty: vyNu.current.ty, rörd: false }
    }
  }

  function rörPekare(e: ReactPointerEvent<SVGSVGElement>) {
    setPekare({ x: e.clientX, y: e.clientY })
    const { x, y } = tillSvg(e)
    if (fingrar.current.has(e.pointerId)) fingrar.current.set(e.pointerId, { x, y })

    const n = nyp.current
    if (n && fingrar.current.size >= 2) {
      const [a, b] = [...fingrar.current.values()]
      const avstånd = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
      const k = Math.min(MAX_SKALA, Math.max(MIN_SKALA, (n.k * avstånd) / n.avstånd))
      const mitt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const ny = begränsa(
        { k, tx: mitt.x - n.innehåll.x * k, ty: mitt.y - n.innehåll.y * k },
        gränser,
      )
      mål.current = ny
      sätt(ny)
      return
    }

    const d = drag.current
    if (!d) return
    // Några pixlars darr när man klickar ska inte räknas som en dragning.
    if (!d.rörd && Math.hypot(x - d.x, y - d.y) > 3 / vyNu.current.k) {
      d.rörd = true
      // Pekaren fångas först när en dragning faktiskt börjat. Fångar man redan
      // vid pointerdown omdirigeras click-händelsen till svg-elementet, och då
      // går prickarna inte att klicka på över huvud taget.
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    // Panorering följer fingret direkt. Utjämning här skulle bara kännas trögt.
    const ny = begränsa({ k: vyNu.current.k, tx: d.tx + (x - d.x), ty: d.ty + (y - d.y) }, gränser)
    mål.current = ny
    sätt(ny)
  }

  function släpp(e?: ReactPointerEvent<SVGSVGElement>) {
    if (e) fingrar.current.delete(e.pointerId)
    else fingrar.current.clear()
    // Lyfter man ett finger ur ett nyp ska det kvarvarande inte rycka till —
    // panoreringen startas om från där fingret nu är.
    if (fingrar.current.size < 2) nyp.current = null
    if (fingrar.current.size === 1) {
      const [f] = [...fingrar.current.values()]
      drag.current = { ...f, tx: vyNu.current.tx, ty: vyNu.current.ty, rörd: true }
    } else if (fingrar.current.size === 0) {
      drag.current = null
    }
  }

  /* Ett klick som avslutar en panorering ska inte välja stilen under fingret. */
  const drog = () => drag.current?.rörd === true

  /* Så snart ett moln visas — en stils öl eller träffarna på ett smakord —
     viker stilprickarna undan. Molnet är då det man tittar på. */
  const molnAktivt = molnpunkter.length > 0

  const [xAxel, yAxel] = karta.axlar
  const knappnål = hovradProdukt
    ? { rubrik: hovradProdukt.namn, under: hovradProdukt.grupper.join(' · ') }
    : hovrad
      ? { rubrik: hovrad.namn, under: `${hovrad.antal} st` }
      : null

  return (
    <div className="karta">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={nedPekare}
        onPointerMove={rörPekare}
        onPointerUp={släpp}
        onPointerCancel={släpp}
        onPointerLeave={() => {
          släpp()
          setHovrad(null)
          setHovradProdukt(null)
        }}
      >
        <g transform={`translate(${vy.tx} ${vy.ty}) scale(${vy.k})`}>
          {/* Prickarna först, etiketterna i eget lager ovanpå — annars målar
              en senare prick över en tidigare grannes namn. */}
          {punkter.map((p) => {
            const aktiv = hovrad?.namn === p.grupp.namn
            const utvald = vald === p.grupp.namn
            // Är en grupp vald träder den fram genom att grannarna viker undan,
            // inte genom att den själv skriker. Kartan behåller sin form —
            // man ska fortfarande se var i rymden man befinner sig.
            const nedtonad = p.tom || (molnAktivt && !utvald)
            return (
              <circle
                key={p.grupp.namn}
                data-grupp={p.grupp.namn}
                cx={p.px}
                cy={p.py}
                r={skStil(p.r)}
                // Den valda stilen är inte längre en prick utan behållaren
                // runt sina öl, och ritas därför som en kontur.
                fill={
                  utvald && molnpunkter.length
                    ? kulör.ring(p.grupp.mörkhet)
                    : kulör.fyllning(p.grupp.mörkhet)
                }
                fillOpacity={utvald && molnpunkter.length ? 0.14 : 1}
                stroke={
                  utvald
                    ? kulör.ring(p.grupp.mörkhet)
                    : aktiv
                      ? 'rgb(255 255 255 / 0.85)'
                      : kulör.kant(p.grupp.mörkhet)
                }
                strokeWidth={sk(utvald ? 2 : aktiv ? 2 : 1)}
                opacity={p.tom ? 0.12 : nedtonad ? (aktiv ? 0.6 : 0.22) : 1}
                onPointerEnter={() => setHovrad(p.grupp)}
                // Utan detta lyser stilen kvar när pekaren glider ut i tomma
                // rutan. Villkoret gör det ofarligt att lämna en prick och
                // gå in i nästa, oavsett i vilken ordning händelserna kommer.
                onPointerLeave={() => setHovrad((h) => (h?.namn === p.grupp.namn ? null : h))}
                onClick={() => !drog() && onVälj(p.grupp)}
              />
            )
          })}

          {/* Ölen i den valda stilen. Ritas efter stilprickarna så att molnet
              ligger ovanpå, och före etiketterna så att namnen syns. */}
          {molnpunkter.map((ö) => {
            const utvald = valdProdukt?.id === ö.produkt.id
            return (
              <circle
                key={ö.produkt.id}
                data-produkt={ö.produkt.id}
                className="olprick"
                cx={ö.px}
                cy={ö.py}
                r={skPrick(utvald ? 5.5 : 3.6)}
                fill={kulör.litenPrick(ö.produkt.mörkhet)}
                stroke={utvald ? 'rgb(255 255 255 / 0.95)' : 'rgb(255 255 255 / 0.45)'}
                strokeWidth={sk(utvald ? 2 : 0.6)}
                onPointerEnter={() => setHovradProdukt(ö.produkt)}
                onPointerLeave={() => setHovradProdukt(null)}
                onClick={() => !drog() && onVäljProdukt(ö.produkt)}
              />
            )
          })}

          {punkter.map((p) => {
            const aktiv = hovrad?.namn === p.grupp.namn
            const utvald = vald === p.grupp.namn
            const y = etiketter.get(p.grupp.namn)
            // Hovrad och vald grupp får alltid sitt namn, även utan ledig plats.
            if (y === undefined && !aktiv && !utvald) return null
            return (
              <text
                key={p.grupp.namn}
                x={p.px}
                y={y ?? p.py + skStil(p.r) + sk(12)}
                textAnchor="middle"
                fontSize={sk(11)}
                className={aktiv || utvald ? 'etikett aktiv' : 'etikett'}
                opacity={molnAktivt && !utvald && !aktiv ? 0.3 : 1}
              >
                {p.grupp.namn}
              </text>
            )
          })}
        </g>
      </svg>

      {/* Axlarna namnges av de ord som väger tyngst i respektive riktning —
          hämtade ur meta.json, inte handskrivna. */}
      <div className="axel vänster">← {xAxel.negativ.slice(0, smal ? 1 : 3).join(', ')}</div>
      <div className="axel höger">{xAxel.positiv.slice(0, smal ? 1 : 3).join(', ')} →</div>
      <div className="axel upp">↑ {yAxel.positiv.slice(0, smal ? 1 : 3).join(', ')}</div>
      <div className="axel ned">↓ {yAxel.negativ.slice(0, smal ? 1 : 3).join(', ')}</div>

      {knappnål && (
        <div className="knappnål" style={{ left: pekare.x + 14, top: pekare.y + 14 }}>
          <strong>{knappnål.rubrik}</strong>
          <span>{knappnål.under}</span>
        </div>
      )}
    </div>
  )
})

export default Karta
