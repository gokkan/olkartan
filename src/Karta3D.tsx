import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Färgkanal, Karta as KartaTyp, Produkt } from './lib/typer'
import { kartfärger } from './lib/färg'
import { heltNamn } from './lib/urval'
import { useSmalSkärm } from './lib/skarm'

const W = 1000
const H = 700
/* Molnet ryms i en sfär, och en sfär som ska kunna vridas fritt utan att
   klippas måste få plats på den kortaste ledden. På en bred skärm blir det
   tomt åt sidorna — det är priset för att ingenting ska försvinna ut i kanten
   mitt i en vridning. Marginalen räknas i skärmpunkter, inte ritenheter, så
   att den betyder samma sak på en telefon som på en skrivbordsskärm. */
const MARGINAL = 26

/* Samma lupp som den platta kartan. Ritytan är 1000×700 och skalas in efter
   den knappaste sidan, vilket på en telefon gör en ritenhet till 0,41
   skärmpunkter — elva punkters text blir fyra och går inte att läsa. Se
   Karta.tsx för resonemanget. */
const REFERENSFAKTOR = 1.06
const MAX_LUPP = 3
const PRICKANDEL = 0.6

/**
 * Samma karta som en roterbar rymd, med den tredje huvudkomponenten som djup.
 *
 * Läget finns av ett enda skäl: på den platta kartan kan två prickar ligga på
 * varandra utan att smaka lika, för allt utom två riktningar är hoptryckt.
 * PC3 skiljer fyra av fem sådana par åt, så de glider isär så fort man vrider.
 * Se PLAN.md — vinsten är att *se* att en granne bedrar en, inte att kunna
 * mäta hur mycket.
 *
 * Man kan bara titta. Inga klick, ingen hovring, inget val — knappen tillbaka
 * till 2D är vägen till att välja något. Det är därför läget alls är rimligt:
 * utan träffytor försvinner djupsorterad träffprövning, etikettkollisioner och
 * en tredje gest på telefonen, och kvar blir ett moln som snurrar.
 *
 * Skalan är enhetlig på alla tre axlarna. Den platta kartan sträcker x mot y
 * för att fylla rutan, men det går inte här: ett moln som deformeras när det
 * vrids ljuger om varje avstånd utom de två man råkar titta rakt på.
 */

/** Grader per sekund när molnet snurrar av sig självt. */
const SNURRFART = 9
/** Hur långt molnet tippar av sig självt, i radianer, och hur fort dit. Runt
 *  0,3 ser man ovansidan utan att den platta kartans upp och ned blir otydliga;
 *  två och en halv sekund är långsamt nog att läsa som en rörelse och inte som
 *  ett hopp. */
const LUTNING = 0.3
const LUTFART = 0.12
/** Hur mycket de bortre prickarna bleknar. 1 = ingen dis. */
const MINSTA_DIS = 0.3
/** Så många gruppnamn skrivs ut. Fler blir en väv av text. */
const NAMN = 14
/** Hur långt axlarna når ut, som andel av sfärens radie. Resten är luft åt
 *  spetsarnas namn, som annars klipps när korset vrids mot en kant. */
const AXELDEL = 0.84
/** En axelspets som projiceras kortare än så namnges inte. Tittar man rakt in
 *  i djupaxeln blir den en punkt i mitten, och dess båda namn skulle hamna
 *  ovanpå varandra just där de tre linjerna möts. */
const KORTASTE_ARM = 30
/** Rutor per sida i mittplanets rutnät. Fler blir ett moaré, färre ger ögat
 *  inget perspektiv att läsa djup ur. */
const RUTOR = 8

type Vinkel = { gir: number; lut: number; k: number }

export default function Karta3D({
  karta,
  färgkanal,
  vald,
  molnet,
  valdProdukt,
  markerad,
}: {
  karta: KartaTyp
  /** Vad prickarna färgas efter, eller null för dryckens egen färg. */
  färgkanal: Färgkanal | null
  vald: string | null
  molnet: Produkt[]
  valdProdukt: Produkt | null
  /** Drycken man håller pekaren över i panelens listor. Molnet går inte att
   *  peka på härinne, men listan gör det — och då är det här den enda vägen
   *  att se var i rymden den drycken ligger. */
  markerad: Produkt | null
}) {
  const kulör = kartfärger(karta.färgskala, färgkanal)
  const smal = useSmalSkärm('(max-width: 700px)')
  const svgRef = useRef<SVGSVGElement>(null)
  const [ruta, setRuta] = useState({ ritfaktor: REFERENSFAKTOR, bredd: 1060, höjd: 864 })
  /* Rakt framifrån, alltså exakt den platta kartan: samma ord åt vänster,
     höger, upp och ned, och djupaxeln en punkt i mitten. Den som kommer hit
     ska känna igen sig innan något börjar röra sig. Vridningen tar sedan över
     och tippar upp det tredje hållet av sig självt. */
  const [vinkel, setVinkel] = useState<Vinkel>({ gir: 0, lut: 0, k: 1 })
  const [snurrar, setSnurrar] = useState(true)
  const drag = useRef<{ x: number; y: number; gir: number; lut: number } | null>(null)
  const nu = useRef(vinkel)
  nu.current = vinkel

  /* Elementets storlek styr både luppen och hur stort molnet ritas. En
     telefonskärm är hög och smal, ritytan bred och låg — utan mätningen fyller
     sfären en femtedel av skärmen. */
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const mät = () => {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      setRuta((f) => {
        const ny = {
          ritfaktor: Math.min(r.width / W, r.height / H),
          bredd: r.width,
          höjd: r.height,
        }
        return f.bredd === ny.bredd && f.höjd === ny.höjd ? f : ny
      })
    }
    mät()
    const ro = new ResizeObserver(mät)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const lupp = Math.min(MAX_LUPP, Math.max(1, REFERENSFAKTOR / ruta.ritfaktor))
  const luppPrick = 1 + (lupp - 1) * PRICKANDEL

  /* Molnet snurrar tills man tar tag i det. Poängen med läget är djupet, och
     djupet syns bara i rörelse — den som öppnar det ska inte behöva veta att
     man får dra. Efter första taget är vinkeln användarens. */
  useEffect(() => {
    if (!snurrar) return
    /* Den som bett om stillhet får ingen ingång — men inte heller startvyn,
       för rakt framifrån är djupaxeln en punkt och läget säger ingenting.
       I stället ett fast, redan tippat läge att titta på. */
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVinkel((v) => ({ ...v, gir: 0.6, lut: 0.32 }))
      setSnurrar(false)
      return
    }
    let bild = 0
    let sist = performance.now()
    const steg = (t: number) => {
      const dt = Math.min(64, t - sist)
      sist = t
      setVinkel((v) => ({
        ...v,
        gir: v.gir + ((SNURRFART * Math.PI) / 180) * (dt / 1000),
        // Lutningen reser sig en gång, från platt till LUTNING, och stannar
        // där. Utan den vore vridningen ett karusellsvep där ingenting någonsin
        // syns uppifrån; med den vecklar rymden ut sig ur den platta kartan.
        lut: Math.min(LUTNING, v.lut + LUTFART * (dt / 1000)),
      }))
      bild = requestAnimationFrame(steg)
    }
    bild = requestAnimationFrame(steg)
    return () => cancelAnimationFrame(bild)
  }, [snurrar])

  /* Enhetlig skala på alla tre axlarna, och en radie som är det verkliga
     avståndet ut till den prick som ligger längst från mitten. Ett moln som
     ryms i en sfär går inte utanför rutan hur man än vrider det, och en sfär
     som mäts på riktigt slösar inte bort halva ytan. */
  const rymd = useMemo(() => {
    const g = karta.grupper
    /* Vridningen sker kring tyngdpunkten, inte kring lådans mitt. Lådans mitt
       ger den minsta omslutande sfären och alltså det största molnet, men
       prickarna ligger inte jämnt: den täta delen skulle svepa fram och
       tillbaka över skärmen medan man vrider, och det är just det som gör en
       roterande vy svår att orientera sig i. Med tyngdpunkten som nav står
       tätheten stilla och det är ytterkanterna som rör sig. */
    const vikt = g.reduce((s, p) => s + p.antal, 0) || 1
    const mitt = {
      x: g.reduce((s, p) => s + p.x * p.antal, 0) / vikt,
      y: g.reduce((s, p) => s + p.y * p.antal, 0) / vikt,
      z: g.reduce((s, p) => s + p.z * p.antal, 0) / vikt,
    }
    const r = Math.max(...g.map((p) => Math.hypot(p.x - mitt.x, p.y - mitt.y, p.z - mitt.z)))
    /* Sfären ska fylla elementets kortaste led, inte ritytans. Radien räknas
       därför i skärmpunkter och översätts tillbaka till ritenheter. */
    const iPunkter = Math.min(ruta.bredd, ruta.höjd) / 2 - MARGINAL
    return { mitt, skala: iPunkter / ruta.ritfaktor / r, djup: r }
  }, [karta, ruta])

  /** Radien i det lokala, skalade rummet — golvets och rutnätets måttstock. */
  const R = rymd.djup * rymd.skala

  /** Roterar en punkt som redan är räknad relativt mitten och skalad. */
  const rotera = useCallback(
    (dx: number, dy: number, dz: number) => {
      const cg = Math.cos(vinkel.gir)
      const sg = Math.sin(vinkel.gir)
      const x1 = dx * cg + dz * sg
      const z1 = -dx * sg + dz * cg
      const cl = Math.cos(vinkel.lut)
      const sl = Math.sin(vinkel.lut)
      const y1 = dy * cl - z1 * sl
      const z2 = dy * sl + z1 * cl
      return {
        px: W / 2 + x1 * vinkel.k,
        py: H / 2 - y1 * vinkel.k,
        // Normaliserat djup, −1 längst bort och 1 närmast.
        d: Math.max(-1, Math.min(1, z2 / R)),
      }
    },
    [vinkel, R],
  )

  const vrid = useCallback(
    (p: { x: number; y: number; z: number }) =>
      rotera(
        (p.x - rymd.mitt.x) * rymd.skala,
        (p.y - rymd.mitt.y) * rymd.skala,
        (p.z - rymd.mitt.z) * rymd.skala,
      ),
    [rotera, rymd],
  )

  /* Allt som ska ritas, bakifrån och fram. Prickarnas storlek följer antalet
     som på den platta kartan — djupet syns i disen i stället, så att de två
     avläsningarna inte slåss om samma kanal. */
  const punkter = useMemo(() => {
    const maxAntal = Math.max(1, ...karta.grupper.map((g) => g.antal))
    const ut = karta.grupper.map((g) => ({
      nyckel: 'G' + g.namn,
      namn: g.namn,
      rang: g.antal,
      ...vrid(g),
      r: 4 + 20 * Math.sqrt(g.antal / maxAntal),
      mörkhet: g.mörkhet,
      // Färgkanalerna läser klockor, alkoholhalt och pris — alla tre måste
      // följa med in i den projicerade punkten. En grupp har alltid ett pris,
      // en produkt kan sakna det; typen tas från den som kan vara tom.
      klockor: g.klockor,
      abv: g.abv,
      prisPerLiter: g.prisPerLiter as number | null,
      grupp: true,
      utvald: vald === g.namn,
    }))
    for (const p of molnet)
      ut.push({
        nyckel: 'P' + p.id,
        namn: '',
        rang: -1,
        ...vrid(p),
        r: valdProdukt?.id === p.id ? 5.5 : 3.2,
        mörkhet: p.mörkhet,
        klockor: p.klockor,
        abv: p.abv,
        prisPerLiter: p.prisPerLiter,
        grupp: false,
        utvald: valdProdukt?.id === p.id,
      })
    return ut.sort((a, b) => a.d - b.d)
  }, [karta, molnet, vald, valdProdukt, vrid])

  /* Namnen. Bara de största grupperna, bara de som ligger i främre halvan, och
     de som ändå krockar hoppas över. Att hoppa över är rätt sort av instabilitet
     här: ett namn som försvinner när en annan prick glider förbi stör mindre än
     ett som flyttar sig, för det är rörelsen man tittar på. */
  /** De grupper som är stora nog att skrivas ut. Samma urval styr lodlinjerna
   *  nedan: landmärkena ska vara samma prickar man ändå läser namnen på. */
  const störst = useMemo(
    () =>
      new Set(
        [...karta.grupper]
          .sort((a, b) => b.antal - a.antal)
          .slice(0, NAMN)
          .map((g) => g.namn),
      ),
    [karta],
  )

  const namnen = useMemo(() => {
    const upptaget: { x: number; y: number; w: number; h: number }[] = []
    const ut: { nyckel: string; namn: string; px: number; py: number; d: number }[] = []
    for (const p of punkter) {
      if (!p.grupp) continue
      if (!p.utvald && (!störst.has(p.namn) || p.d < -0.15)) continue
      const w = p.namn.length * 5.6 * lupp
      const låda = { x: p.px - w / 2, y: p.py + p.r * luppPrick + 3 * lupp, w, h: 13 * lupp }
      const krockar = upptaget.some(
        (q) =>
          låda.x < q.x + q.w &&
          låda.x + låda.w > q.x &&
          låda.y < q.y + q.h &&
          låda.y + låda.h > q.y,
      )
      if (krockar && !p.utvald) continue
      upptaget.push(låda)
      ut.push({ nyckel: p.nyckel, namn: p.namn, px: p.px, py: låda.y + 10 * lupp, d: p.d })
    }
    return ut
  }, [punkter, störst, lupp, luppPrick])

  /* Tre axlar genom mitten, sex namngivna spetsar och en punkt där de möts.
     Detta ersatte ett rutnätsgolv och en kompass i hörnet, som tillsammans sa
     vilket håll man vridit men aldrig vad hållen betyder.

     Att streck genom molnet lästes som innehåll var en gång skälet till att de
     togs bort. Tre saker gör dem läsbara som ram i stället: de ritas bakom
     prickarna, så varje dryck skymmer dem; den bortre halvan av varje arm
     bleknar med samma dis som prickarna, så korset ligger i samma rymd som
     molnet i stället för ovanpå det; och spetsarna bär kartans egna axelord,
     vilket ingen prick gör.

     Armarna är lika långa åt alla sex håll fast molnet är plattare i djupled.
     Ett kors som följde utbredningen skulle stämma bättre med datan men vore
     obrukbart som referens: det ändrade form vid varje kartbyte, och en
     kortare arm skulle läsas som en mindre viktig riktning. */
  const axelkors = useMemo(() => {
    const L = R * AXELDEL
    const riktningar: [number, number, number][] = [
      [L, 0, 0],
      [0, L, 0],
      [0, 0, L],
    ]
    return riktningar.flatMap(([rx, ry, rz], i) =>
      [1, -1].map((tecken) => {
        const spets = rotera(rx * tecken, ry * tecken, rz * tecken)
        const dx = spets.px - W / 2
        const dy = spets.py - H / 2
        const arm = Math.hypot(dx, dy) || 1
        return {
          nyckel: `${i}:${tecken}`,
          px: spets.px,
          py: spets.py,
          d: spets.d,
          arm,
          ord: (tecken > 0 ? karta.axlar[i].positiv : karta.axlar[i].negativ)
            .slice(0, smal ? 1 : 2)
            .join(', '),
          /* Namnet sätts en bit bortom spetsen i armens egen riktning, och
             ankras åt det håll armen pekar. Utan ankringen lägger sig texten
             tvärs över linjen den namnger så fort korset vridits ett kvarv. */
          tx: spets.px + (dx / arm) * 9 * lupp,
          ty: spets.py + (dy / arm) * 9 * lupp,
          ankare: (dx > arm * 0.35 ? 'start' : dx < -arm * 0.35 ? 'end' : 'middle') as
            'start' | 'end' | 'middle',
          lyft: dy > arm * 0.35 ? 10 * lupp : dy < -arm * 0.35 ? -4 * lupp : 4 * lupp,
        }
      }),
    )
  }, [rotera, R, karta, smal, lupp])

  /* Ett rutnät i mittplanet — det plan som de två vågräta axlarna spänner upp.
     Axelkorset säger vilket håll man vridit, men inte hur långt bort något
     ligger: två prickar med samma skärmläge kan sitta på var sin sida om
     mitten och man ser ingen skillnad.

     Rutnätet är inte till för att mätas i. Det finns för att perspektivet ska
     ha något att verka på: rutorna blir trängre bortåt och glesare framåt, och
     det är den kilformen ögat läser djup ur. Därför är det blekt och därför
     ligger det i samma plan som korset, inte under molnet som det gamla golvet
     gjorde — det ska läsas som att korset fått en yta, inte som ett andra
     föremål i bilden. */
  const rutnät = useMemo(() => {
    /* Rutnätet är en kvadrat, och en kvadrats hörn ligger √2 gånger längre ut
       än dess sida. Sidan hålls därför innanför R/√2, annars sticker hörnen
       utanför bild när planet vrids. Inom den gränsen läggs det så tätt intill
       molnet som molnet självt kräver. */
    const bredast = Math.max(
      ...karta.grupper.map((g) =>
        Math.max(
          Math.abs((g.x - rymd.mitt.x) * rymd.skala),
          Math.abs((g.z - rymd.mitt.z) * rymd.skala),
        ),
      ),
    )
    const kant = Math.min(R / Math.SQRT2, bredast * 1.12)
    const steg = (kant * 2) / RUTOR
    const linjer: { x1: number; y1: number; x2: number; y2: number; d: number }[] = []
    for (let i = 0; i <= RUTOR; i++) {
      const t = -kant + i * steg
      for (const [a, b] of [
        [rotera(t, 0, -kant), rotera(t, 0, kant)],
        [rotera(-kant, 0, t), rotera(kant, 0, t)],
      ])
        linjer.push({ x1: a.px, y1: a.py, x2: b.px, y2: b.py, d: (a.d + b.d) / 2 })
    }
    return linjer
  }, [rotera, R, karta, rymd])

  /* Lodlinjer från landmärkena ned till mittplanet, med en fot där de landar.
     Det här är det som faktiskt löser djupet: en prick som svävar går inte att
     placera, men en prick med ett streck ned till en fot i rutnätet gör det —
     man läser av foten i stället för pricken, och foten ligger i ett plan man
     ser lutningen på.

     Bara de utskrivna grupperna får ett. Alla sextio vore en skog, och
     landmärken man inte kan namnge är inga landmärken: det ska vara samma
     prickar man ändå läser namnen på. */
  const stolpar = useMemo(
    () =>
      karta.grupper
        .filter((g) => störst.has(g.namn))
        .map((g) => {
          const dx = (g.x - rymd.mitt.x) * rymd.skala
          const dz = (g.z - rymd.mitt.z) * rymd.skala
          const topp = vrid(g)
          const fot = rotera(dx, 0, dz)
          return { nyckel: g.namn, x1: topp.px, y1: topp.py, x2: fot.px, y2: fot.py, d: fot.d }
        }),
    [karta, störst, rymd, vrid, rotera],
  )

  /* Lodlinjen från den valda pricken till mittplanet. Samma sak som stolparna
     ovan, men ljusare och alltid utritad — den svarar på var just den här
     drycken ligger, inte på var rummet är.

     Den gick förut ned till ett golv under molnet. Mittplanet är bättre av två
     skäl: foten landar i rutnätet i stället för i tomma luften, och strecket
     säger hur långt över eller under mitten drycken ligger i stället för hur
     högt den svävar över en godtycklig underkant. */
  const lodlinje = useMemo(() => {
    const träff = valdProdukt ?? karta.grupper.find((g) => g.namn === vald)
    if (!träff) return null
    const dx = (träff.x - rymd.mitt.x) * rymd.skala
    const dy = (träff.y - rymd.mitt.y) * rymd.skala
    const dz = (träff.z - rymd.mitt.z) * rymd.skala
    const a = rotera(dx, dy, dz)
    const b = rotera(dx, 0, dz)
    return { x1: a.px, y1: a.py, x2: b.px, y2: b.py, fot: b }
  }, [valdProdukt, vald, karta, rymd, rotera])

  /* Samma markering som på den platta kartan: pricken man hovrar över i
     panelen, ett streck till den man tittar på, och en egen lodlinje ned till
     mittplanet. Lodlinjen är viktigare här än där — utan den syns bara att
     grannen ligger åt vänster, inte att den ligger åt vänster *och* bakom. */
  const märke = useMemo(() => {
    if (!markerad) return null
    const till = vrid(markerad)
    const fot = rotera(
      (markerad.x - rymd.mitt.x) * rymd.skala,
      0,
      (markerad.z - rymd.mitt.z) * rymd.skala,
    )
    const från = valdProdukt && valdProdukt.id !== markerad.id ? vrid(valdProdukt) : null
    return { till, fot, från, produkt: markerad }
  }, [markerad, valdProdukt, vrid, rotera, rymd])

  function ned(e: React.PointerEvent<SVGSVGElement>) {
    setSnurrar(false)
    drag.current = { x: e.clientX, y: e.clientY, gir: nu.current.gir, lut: nu.current.lut }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function rör(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current
    if (!d) return
    setVinkel((v) => ({
      ...v,
      gir: d.gir + (e.clientX - d.x) * 0.008,
      // Lutningen stannar strax före rakt uppifrån. Passerar man polen vänds
      // vridningen bakvänd och man tappar bort sig.
      lut: Math.max(-1.35, Math.min(1.35, d.lut - (e.clientY - d.y) * 0.008)),
    }))
  }
  const släpp = () => {
    drag.current = null
  }

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const hjul = (e: WheelEvent) => {
      e.preventDefault()
      setSnurrar(false)
      setVinkel((v) => ({
        ...v,
        k: Math.min(6, Math.max(0.6, v.k * Math.exp(-e.deltaY * 0.0018))),
      }))
    }
    el.addEventListener('wheel', hjul, { passive: false })
    return () => el.removeEventListener('wheel', hjul)
  }, [])

  const dis = (d: number) => MINSTA_DIS + (1 - MINSTA_DIS) * ((d + 1) / 2)

  return (
    <div className="karta karta3d">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={ned}
        onPointerMove={rör}
        onPointerUp={släpp}
        onPointerCancel={släpp}
        onPointerLeave={släpp}
      >
        {/* Rutnätet allra först, sedan stolparna, sedan korset. Alltihop ligger
            bakom molnet — det är avsikten att prickarna målar över det: en ram
            man ser förbi, inte innehåll att läsa. */}
        <g className="rutnat" strokeWidth={0.7 * lupp}>
          {rutnät.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              opacity={0.07 + 0.17 * ((l.d + 1) / 2)}
            />
          ))}
        </g>

        <g className="stolpar" strokeWidth={0.7 * lupp}>
          {stolpar.map((s) => (
            <g key={s.nyckel} opacity={0.12 + 0.26 * ((s.d + 1) / 2)}>
              <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
              <circle cx={s.x2} cy={s.y2} r={1.5 * lupp} />
            </g>
          ))}
        </g>

        <g className="axelkors">
          {axelkors.map((a) => (
            <line
              key={a.nyckel}
              x1={W / 2}
              y1={H / 2}
              x2={a.px}
              y2={a.py}
              strokeWidth={0.9 * lupp}
              opacity={dis(a.d)}
            />
          ))}
        </g>

        {lodlinje && (
          <g className="lodlinje">
            <line
              x1={lodlinje.x1}
              y1={lodlinje.y1}
              x2={lodlinje.x2}
              y2={lodlinje.y2}
              strokeWidth={1.1 * lupp}
            />
            <circle cx={lodlinje.fot.px} cy={lodlinje.fot.py} r={2.2 * lupp} />
          </g>
        )}

        {punkter.map((p) => (
          <circle
            key={p.nyckel}
            // Bara till för att gå att mäta utifrån. Pekaren når dem inte —
            // se `.karta3d circle` i index.css.
            {...(p.grupp ? { 'data-grupp': p.namn } : {})}
            cx={p.px}
            cy={p.py}
            // Prickarna behåller sin storlek på skärmen när man zoomar, precis
            // som på den platta kartan — zoomen sprider isär molnet, den
            // förstorar det inte.
            r={p.r * luppPrick}
            fill={p.grupp ? kulör.fyllning(p) : kulör.litenPrick(p)}
            stroke={p.utvald ? 'rgb(255 255 255 / 0.95)' : kulör.kant(p)}
            strokeWidth={(p.utvald ? 2.5 : 0.8) * lupp}
            opacity={dis(p.d) * (molnet.length && p.grupp && !p.utvald ? 0.3 : 1)}
          />
        ))}

        {märke && (
          <g className="marke">
            <line
              x1={märke.till.px}
              y1={märke.till.py}
              x2={märke.fot.px}
              y2={märke.fot.py}
              strokeWidth={1.1 * lupp}
            />
            {märke.från && (
              <line
                x1={märke.från.px}
                y1={märke.från.py}
                x2={märke.till.px}
                y2={märke.till.py}
                strokeWidth={1.1 * lupp}
              />
            )}
            <circle
              cx={märke.till.px}
              cy={märke.till.py}
              r={3.4 * luppPrick}
              fill={kulör.litenPrick(märke.produkt)}
              stroke="none"
            />
            <circle
              className="marke-ring"
              cx={märke.till.px}
              cy={märke.till.py}
              r={9 * luppPrick}
              strokeWidth={1.5 * lupp}
            />
            <text
              className="etikett aktiv"
              x={märke.till.px}
              y={märke.till.py - 9 * luppPrick - 5 * lupp}
              textAnchor="middle"
              fontSize={11 * lupp}
            >
              {heltNamn(märke.produkt)}
            </text>
          </g>
        )}

        {namnen.map((t) => (
          <text
            key={'T' + t.nyckel}
            className="etikett"
            x={t.px}
            y={t.py}
            textAnchor="middle"
            fontSize={11 * lupp}
            opacity={dis(t.d)}
          >
            {t.namn}
          </text>
        ))}

        {/* Axelnamnen och mittpunkten sist. Namnen ligger utanför molnet ändå;
            punkten är navet allt vrids kring och får inte hamna under en prick.

            En arm som projiceras kort namnges inte. Rakt framifrån är
            djupaxeln en punkt i mitten, och dess båda ord skulle ligga ovanpå
            varandra där de tre linjerna möts — men vridningen fäller ut dem
            inom ett par sekunder, och noten under kartan säger vad de är
            under tiden. */}
        <g className="axelnamn" style={{ fontSize: 11 * lupp }}>
          {axelkors.map(
            (a) =>
              a.arm > KORTASTE_ARM * lupp && (
                <text
                  key={a.nyckel}
                  x={a.tx}
                  y={a.ty}
                  dy={a.lyft}
                  textAnchor={a.ankare}
                  strokeWidth={3 * lupp}
                  opacity={0.45 + 0.5 * ((a.d + 1) / 2)}
                >
                  {a.ord}
                </text>
              ),
          )}
          {/* Navet. Ritad med mörk kontur, för den ligger ofta mitt i den
              tätaste delen av molnet och skulle annars försvinna in i en ljus
              prick just där den behövs som mest. */}
          <circle
            className="mittpunkt"
            cx={W / 2}
            cy={H / 2}
            r={2.6 * lupp}
            strokeWidth={2 * lupp}
          />
        </g>
      </svg>

      {/* Noten stod förut för att säga vad den tredje riktningen var — den
          gick inte att rita. Nu står den på sin egen axel med sina egna ord,
          och kvar är bara det man inte kan se: att man får ta i molnet. */}
      <div className="grepp-not">dra för att vrida{smal ? '' : ', rulla för att zooma'}</div>
    </div>
  )
}
