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
import type { Meta, Produkt, Stil } from './lib/typer'
import { srm, kant, srmLitenPrick, srmRing } from './lib/färg'

const W = 1000
const H = 700
const MARGINAL = 60

const MIN_SKALA = 0.6
const MAX_SKALA = 14
/* Tidskonstant för glidet, i millisekunder. Lägre är snabbare och hårdare.
   Runt 110 ms känns det som att vyn har vikt utan att släpa efter. */
const TRÖGHET = 110

type Vy = { k: number; tx: number; ty: number }

export type KartHandtag = {
  /** Centrera en punkt i datakoordinater, med mjuk inflygning. */
  flygTill: (x: number, y: number, skala?: number) => void
  /** Rama in en samling punkter så att alla precis får plats. */
  rymPunkter: (punkter: { x: number; y: number }[]) => void
}

type Props = {
  stilar: Stil[]
  meta: Meta
  vald: string | null
  /** Ölen som ska ritas ut som ett moln. En stils produkter, eller träffarna
   *  på ett smakord — kartan bryr sig inte om vilket. */
  molnet: Produkt[]
  /** Antal öl per stil efter filtrering, för prickarnas storlek. Utelämnas
   *  filtret används stilens fulla antal. */
  antalPerStil: Map<string, number> | null
  valdProdukt: Produkt | null
  onVälj: (s: Stil) => void
  onVäljProdukt: (p: Produkt) => void
}

const Karta = forwardRef<KartHandtag, Props>(function Karta(
  { stilar, meta, vald, molnet, antalPerStil, valdProdukt, onVälj, onVäljProdukt },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [vy, setVy] = useState<Vy>({ k: 1, tx: 0, ty: 0 })
  const [hovrad, setHovrad] = useState<Stil | null>(null)
  const [hovradProdukt, setHovradProdukt] = useState<Produkt | null>(null)
  const [pekare, setPekare] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; rörd: boolean } | null>(null)

  /* Vyn finns i tre exemplar med olika uppgifter: `vy` är den som ritas,
     `vyNu` är samma värde läsbart utan att stänga in det i en callback, och
     `mål` är dit vi är på väg. Glidet mellan de två sista är hela effekten. */
  const vyNu = useRef(vy)
  const mål = useRef(vy)
  const bild = useRef<number | null>(null)
  const sistaTid = useRef(0)

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

  /* Datakoordinater → ritytan. Y vänds: PCA räknar uppåt, SVG nedåt. */
  const skala = useMemo(() => {
    const xs = stilar.map((s) => s.x)
    const ys = stilar.map((s) => s.y)
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
  }, [stilar])

  const punkter = useMemo(() => {
    const antalet = (s: Stil) => antalPerStil?.get(s.namn) ?? s.antal
    const maxAntal = Math.max(1, ...stilar.map(antalet))
    return stilar.map((s) => ({
      stil: s,
      px: skala.px(s.x),
      py: skala.py(s.y),
      // Kvadratrot, inte linjärt: annars äter IPA upp halva kartan. Filtreras
      // sortimentet krymper prickarna med antalet som återstår.
      r: 4 + 20 * Math.sqrt(antalet(s) / maxAntal),
      tom: antalet(s) === 0,
    }))
  }, [stilar, skala, antalPerStil])

  /* De enskilda ölen i den valda stilen. Varje öl har en egen koordinat i
     samma rymd som stilarna — molnet visar hur brett stilen spretar, och att
     den överlappar sina grannar. */
  const ölpunkter = useMemo(
    () => molnet.map((p) => ({ produkt: p, px: skala.px(p.x), py: skala.py(p.y) })),
    [molnet, skala],
  )

  useImperativeHandle(
    ref,
    () => ({
      flygTill(x, y, önskad) {
        const k = Math.min(MAX_SKALA, Math.max(MIN_SKALA, önskad ?? Math.max(vyNu.current.k, 3)))
        mål.current = { k, tx: W / 2 - skala.px(x) * k, ty: H / 2 - skala.py(y) * k }
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
        mål.current = { k, tx: W / 2 - mx * k, ty: H / 2 - my * k }
        animera()
      },
    }),
    [skala, animera],
  )

  /* Etiketter placeras girigt, störst stil först. En etikett måste vara fri
   * från både andra etiketter och alla prickar — annars hoppas den över och
   * dyker istället upp vid hover. Testet görs i skärmenheter, så fler
   * etiketter träder fram när man zoomar in. Det är meningen. */
  const etiketter = useMemo(() => {
    type Ruta = { x: number; y: number; w: number; h: number; ägare?: string }
    const upptaget: Ruta[] = punkter.map((p) => ({
      x: p.px - p.r / vy.k,
      y: p.py - p.r / vy.k,
      w: (2 * p.r) / vy.k,
      h: (2 * p.r) / vy.k,
      ägare: p.stil.namn,
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

    const höjd = 12 / vy.k
    // Namn → baslinje för texten, så att ritningen använder exakt den plats
    // kollisionstestet godkände.
    const valda = new Map<string, number>()
    for (const p of [...punkter].sort((a, b) => b.stil.antal - a.stil.antal)) {
      const bredd = (p.stil.namn.length * 5.6) / vy.k
      // Under pricken, ovanför, och sist tvärs över den egna pricken. Det
      // tredje läget räddar de största stilarna, som ligger tätast och annars
      // blir de enda utan namn. Texten har mörk kontur och tål underlaget.
      const kandidater = [
        p.py + p.r / vy.k + 3 / vy.k,
        p.py - p.r / vy.k - höjd - 3 / vy.k,
        p.py - höjd / 2,
      ]
      for (const y of kandidater) {
        const ruta = { x: p.px - bredd / 2, y, w: bredd, h: höjd, ägare: p.stil.namn }
        if (krockar(ruta, p.stil.namn)) continue
        upptaget.push(ruta)
        valda.set(p.stil.namn, y + höjd * 0.8)
        break
      }
    }
    return valda
  }, [punkter, vy.k])

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
      mål.current = { k, tx: x - ((x - m.tx) * k) / m.k, ty: y - ((y - m.ty) * k) / m.k }
      animera()
    }
    el.addEventListener('wheel', hjul, { passive: false })
    return () => el.removeEventListener('wheel', hjul)
  }, [tillSvg, animera])

  function nedPekare(e: ReactPointerEvent<SVGSVGElement>) {
    const { x, y } = tillSvg(e)
    // En dragning avbryter en pågående inflygning — annars slåss de om vyn.
    if (bild.current !== null) {
      cancelAnimationFrame(bild.current)
      bild.current = null
      mål.current = vyNu.current
    }
    drag.current = { x, y, tx: vyNu.current.tx, ty: vyNu.current.ty, rörd: false }
  }

  function rörPekare(e: ReactPointerEvent<SVGSVGElement>) {
    setPekare({ x: e.clientX, y: e.clientY })
    const d = drag.current
    if (!d) return
    const { x, y } = tillSvg(e)
    // Några pixlars darr när man klickar ska inte räknas som en dragning.
    if (!d.rörd && Math.hypot(x - d.x, y - d.y) > 3 / vyNu.current.k) {
      d.rörd = true
      // Pekaren fångas först när en dragning faktiskt börjat. Fångar man redan
      // vid pointerdown omdirigeras click-händelsen till svg-elementet, och då
      // går prickarna inte att klicka på över huvud taget.
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    // Panorering följer fingret direkt. Utjämning här skulle bara kännas trögt.
    const ny = { k: vyNu.current.k, tx: d.tx + (x - d.x), ty: d.ty + (y - d.y) }
    mål.current = ny
    sätt(ny)
  }

  const släpp = () => (drag.current = null)

  /* Ett klick som avslutar en panorering ska inte välja stilen under fingret. */
  const drog = () => drag.current?.rörd === true

  /* Så snart ett moln visas — en stils öl eller träffarna på ett smakord —
     viker stilprickarna undan. Molnet är då det man tittar på. */
  const molnAktivt = ölpunkter.length > 0

  const [xAxel, yAxel] = meta.axlar
  const knappnål = hovradProdukt
    ? { rubrik: hovradProdukt.namn, under: hovradProdukt.stil }
    : hovrad
      ? { rubrik: hovrad.namn, under: `${hovrad.antal} öl` }
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
            const aktiv = hovrad?.namn === p.stil.namn
            const utvald = vald === p.stil.namn
            // Är en stil vald träder den fram genom att grannarna viker undan,
            // inte genom att den själv skriker. Kartan behåller sin form —
            // man ska fortfarande se var i rymden man befinner sig.
            const nedtonad = p.tom || (molnAktivt && !utvald)
            return (
              <circle
                key={p.stil.namn}
                data-stil={p.stil.namn}
                cx={p.px}
                cy={p.py}
                r={p.r / vy.k}
                // Den valda stilen är inte längre en prick utan behållaren
                // runt sina öl, och ritas därför som en kontur.
                fill={utvald && ölpunkter.length ? srmRing(p.stil.mörkhet) : srm(p.stil.mörkhet)}
                fillOpacity={utvald && ölpunkter.length ? 0.14 : 1}
                stroke={
                  utvald
                    ? srmRing(p.stil.mörkhet)
                    : aktiv
                      ? 'rgb(255 255 255 / 0.85)'
                      : kant(p.stil.mörkhet)
                }
                strokeWidth={(utvald ? 2 : aktiv ? 2 : 1) / vy.k}
                opacity={p.tom ? 0.12 : nedtonad ? (aktiv ? 0.6 : 0.22) : 1}
                onPointerEnter={() => setHovrad(p.stil)}
                onClick={() => !drog() && onVälj(p.stil)}
              />
            )
          })}

          {/* Ölen i den valda stilen. Ritas efter stilprickarna så att molnet
              ligger ovanpå, och före etiketterna så att namnen syns. */}
          {ölpunkter.map((ö) => {
            const utvald = valdProdukt?.id === ö.produkt.id
            return (
              <circle
                key={ö.produkt.id}
                data-ol={ö.produkt.id}
                className="olprick"
                cx={ö.px}
                cy={ö.py}
                r={(utvald ? 5.5 : 3.6) / vy.k}
                fill={srmLitenPrick(ö.produkt.mörkhet)}
                stroke={utvald ? 'rgb(255 255 255 / 0.95)' : 'rgb(255 255 255 / 0.45)'}
                strokeWidth={(utvald ? 2 : 0.6) / vy.k}
                onPointerEnter={() => setHovradProdukt(ö.produkt)}
                onPointerLeave={() => setHovradProdukt(null)}
                onClick={() => !drog() && onVäljProdukt(ö.produkt)}
              />
            )
          })}

          {punkter.map((p) => {
            const aktiv = hovrad?.namn === p.stil.namn
            const utvald = vald === p.stil.namn
            const y = etiketter.get(p.stil.namn)
            // Hovrad och vald stil får alltid sitt namn, även utan ledig plats.
            if (y === undefined && !aktiv && !utvald) return null
            return (
              <text
                key={p.stil.namn}
                x={p.px}
                y={y ?? p.py + p.r / vy.k + 12 / vy.k}
                textAnchor="middle"
                fontSize={11 / vy.k}
                className={aktiv || utvald ? 'etikett aktiv' : 'etikett'}
                opacity={molnAktivt && !utvald && !aktiv ? 0.3 : 1}
              >
                {p.stil.namn}
              </text>
            )
          })}
        </g>
      </svg>

      {/* Axlarna namnges av de ord som väger tyngst i respektive riktning —
          hämtade ur meta.json, inte handskrivna. */}
      <div className="axel vänster">← {xAxel.negativ.slice(0, 3).join(', ')}</div>
      <div className="axel höger">{xAxel.positiv.slice(0, 3).join(', ')} →</div>
      <div className="axel upp">↑ {yAxel.positiv.slice(0, 3).join(', ')}</div>
      <div className="axel ned">↓ {yAxel.negativ.slice(0, 3).join(', ')}</div>

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
