import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Färgkanal, Grupp, Karta as KartaTyp, Produkt } from './lib/typer'
import { kartfärger } from './lib/färg'
import { plats, rymdmått, type Axlar, type Punkt } from './lib/axlar'
import { grupprad, heltNamn } from './lib/urval'
import { träffa } from './lib/traff'
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
 * Man kan titta och peka, men inte välja — knappen tillbaka till 2D är vägen
 * till att välja något. Av de tre saker som en gång motiverade att läget inte
 * hade några träffytor alls kommer bara den ena tillbaka med hovringen:
 * djupsorterad träffprövning, och den är billig och ligger i `lib/traff`.
 * Etikettkollisioner blir det inga av — rutan är ett enda element som följer
 * pekaren — och ingen tredje gest på telefonen, för hovring finns inte där.
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
/** Hur långt utanför sin egen kant en prick svarar på pekaren. Molnets prickar
 *  är drygt tre ritenheter och vore annars nästan omöjliga att träffa. Talet är
 *  litet med flit: blir det stort svarar ett tätt moln alltid någonting, och ett
 *  svar man inte kan lita på är sämre än inget svar alls. */
const SLOP = 2

/** Rutor per sida i mittplanets rutnät. Fler blir ett moaré, färre ger ögat
 *  inget perspektiv att läsa djup ur. */
const RUTOR = 8

type Vinkel = { gir: number; lut: number; k: number }

export default function Karta3D({
  karta,
  färgkanal,
  axel,
  vald,
  molnet,
  valdProdukt,
  markerad,
}: {
  karta: KartaTyp
  /** Vad prickarna färgas efter, eller null för dryckens egen färg. */
  färgkanal: Färgkanal | null
  /** Vad de tre riktningarna visar. Förvalet är kartans tre huvudkomponenter,
   *  och då är det här läget exakt det det alltid har varit. */
  axel: Axlar
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
  /* Prickens nyckel, inte pricken själv: `punkter` räknas om vid varje vridning,
     och ett sparat objekt vore inaktuellt nästa bildruta. Klientkoordinaterna
     följer med separat, för rutan ligger i sidans rum och inte i svg:ns. */
  const [pekad, setPekad] = useState<string | null>(null)
  const [pekare, setPekare] = useState({ x: 0, y: 0 })
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
  /* Sfären ska fylla elementets kortaste led, inte ritytans. Radien räknas
     därför i skärmpunkter och översätts tillbaka till ritenheter. Resten —
     tyngdpunkten som nav, enheten per axel, skalan — ligger i `rymdmått`, för
     den räkningen går att pröva och en komponent går inte att pröva. */
  const rymd = useMemo(() => {
    const iPunkter = Math.min(ruta.bredd, ruta.höjd) / 2 - MARGINAL
    return rymdmått(karta.grupper, axel, iPunkter / ruta.ritfaktor)
  }, [karta, axel, ruta])

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

  /** Punkten på skärmen, eller null när någon axel saknar värde för den. */
  const vrid = useCallback(
    (p: Punkt) => {
      const l = plats(p, axel, rymd)
      return l && rotera(l[0], l[1], l[2])
    },
    [rotera, axel, rymd],
  )

  /** Samma punkt nedfälld till mittplanet — foten stolparna och lodlinjerna
   *  landar i. Axel 1 är den lodräta; axel 0 och 2 spänner upp planet. */
  const fotpunkt = useCallback(
    (p: Punkt) => {
      const l = plats(p, axel, rymd)
      return l && rotera(l[0], 0, l[2])
    },
    [rotera, axel, rymd],
  )

  /* Allt som ska ritas, bakifrån och fram. Prickarnas storlek följer antalet
     som på den platta kartan — djupet syns i disen i stället, så att de två
     avläsningarna inte slåss om samma kanal. */
  const punkter = useMemo(() => {
    const maxAntal = Math.max(1, ...karta.grupper.map((g) => g.antal))
    /* En punkt utan värde på någon av axlarna ritas inte alls. Det gäller bara
       priset, och bara de få produkter som saknar volym hos Systembolaget —
       att lägga dem på axelns mitt vore att placera dem någonstans de inte hör
       hemma. Grupperna har alltid alla värden, så molnet tappar aldrig sin
       ram. */
    const ut = karta.grupper.flatMap((g) => {
      const v = vrid(g)
      if (!v) return []
      return [
        {
          nyckel: 'G' + g.namn,
          namn: g.namn,
          rang: g.antal,
          ...v,
          r: 4 + 20 * Math.sqrt(g.antal / maxAntal),
          mörkhet: g.mörkhet,
          // Färgkanalerna läser klockor, alkoholhalt och pris — alla tre måste
          // följa med in i den projicerade punkten. En grupp har alltid ett pris,
          // en produkt kan sakna det; typen tas från den som kan vara tom.
          klockor: g.klockor,
          abv: g.abv,
          prisPerLiter: g.prisPerLiter as number | null,
          // Källan följer med så att hovringen kan fråga den om namn och stil
          // utan att slå upp den en gång till. Typen tas från den som kan vara
          // båda, av samma skäl som priset ovan.
          ur: g as Grupp | Produkt,
          grupp: true,
          utvald: vald === g.namn,
        },
      ]
    })
    for (const p of molnet) {
      const v = vrid(p)
      if (!v) continue
      ut.push({
        nyckel: 'P' + p.id,
        namn: '',
        rang: -1,
        ...v,
        r: valdProdukt?.id === p.id ? 5.5 : 3.2,
        mörkhet: p.mörkhet,
        klockor: p.klockor,
        abv: p.abv,
        prisPerLiter: p.prisPerLiter,
        ur: p,
        grupp: false,
        utvald: valdProdukt?.id === p.id,
      })
    }
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
          ord: axel[i].spetsar[tecken > 0 ? 1 : 0].slice(0, smal ? 1 : 2).join(', '),
          /* Namnet sätts en bit bortom spetsen i armens egen riktning, och
             ankras åt det håll armen pekar. Utan ankringen lägger sig texten
             tvärs över linjen den namnger så fort korset vridits ett kvarv. */
          tx: spets.px + (dx / arm) * 9 * lupp,
          ty: spets.py + (dy / arm) * 9 * lupp,
          ankare: (dx > arm * 0.35 ? 'start' : dx < -arm * 0.35 ? 'end' : 'middle') as
            | 'start'
            | 'end'
            | 'middle',
          lyft: dy > arm * 0.35 ? 10 * lupp : dy < -arm * 0.35 ? -4 * lupp : 4 * lupp,
        }
      }),
    )
  }, [rotera, R, axel, smal, lupp])

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
      0,
      ...karta.grupper.flatMap((g) => {
        const l = plats(g, axel, rymd)
        return l ? [Math.max(Math.abs(l[0]), Math.abs(l[2]))] : []
      }),
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
  }, [rotera, R, karta, axel, rymd])

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
        .flatMap((g) => {
          const topp = vrid(g)
          const fot = fotpunkt(g)
          if (!topp || !fot) return []
          return [{ nyckel: g.namn, x1: topp.px, y1: topp.py, x2: fot.px, y2: fot.py, d: fot.d }]
        }),
    [karta, störst, vrid, fotpunkt],
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
    const a = vrid(träff)
    const b = fotpunkt(träff)
    if (!a || !b) return null
    return { x1: a.px, y1: a.py, x2: b.px, y2: b.py, fot: b }
  }, [valdProdukt, vald, karta, vrid, fotpunkt])

  /* Samma markering som på den platta kartan: pricken man hovrar över i
     panelen, ett streck till den man tittar på, och en egen lodlinje ned till
     mittplanet. Lodlinjen är viktigare här än där — utan den syns bara att
     grannen ligger åt vänster, inte att den ligger åt vänster *och* bakom. */
  const märke = useMemo(() => {
    if (!markerad) return null
    const till = vrid(markerad)
    const fot = fotpunkt(markerad)
    if (!till || !fot) return null
    const från = valdProdukt && valdProdukt.id !== markerad.id ? vrid(valdProdukt) : null
    return { till, fot, från, produkt: markerad }
  }, [markerad, valdProdukt, vrid, fotpunkt])

  /** Klientkoordinater till ritytans egna. Molnet har ingen `<g>`-transform —
   *  zoomen ligger i `vinkel.k` inne i projektionen — så matrisen landar direkt
   *  i samma rum som prickarnas `px`/`py`. Samma grepp som den platta kartan. */
  const tillSvg = useCallback((e: { clientX: number; clientY: number }) => {
    const ctm = svgRef.current?.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }, [])

  function ned(e: React.PointerEvent<SVGSVGElement>) {
    setSnurrar(false)
    setPekad(null)
    drag.current = { x: e.clientX, y: e.clientY, gir: nu.current.gir, lut: nu.current.lut }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function rör(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current
    if (d) {
      setVinkel((v) => ({
        ...v,
        gir: d.gir + (e.clientX - d.x) * 0.008,
        // Lutningen stannar strax före rakt uppifrån. Passerar man polen vänds
        // vridningen bakvänd och man tappar bort sig.
        lut: Math.max(-1.35, Math.min(1.35, d.lut - (e.clientY - d.y) * 0.008)),
      }))
      return
    }
    /* Ett finger som vrider molnet ska inte samtidigt öppna en ruta, och en
       pekskärm har ingen hovring att tala om — den skickar ändå pointermove
       under en dragning. Båda faller bort här. */
    if (e.pointerType === 'touch') return

    const i = tillSvg(e)
    const träff = i && träffa(punkter, i.x, i.y, luppPrick, SLOP * lupp)
    /* Ingen träff och ingen sedan förut: rör ingenting. Utan den grinden ritas
       varje prick i molnet om vid varje musrörelse över tom yta, och molnet kan
       vara tusentals prickar. */
    if (!träff && !pekad) return
    setPekad(träff?.nyckel ?? null)
    setPekare({ x: e.clientX, y: e.clientY })
    /* Ett mål som glider undan under pekaren går inte att läsa. Snurren har
       ändå gjort sitt när man börjat peka på enskilda prickar — då tittar man
       inte längre på att rymden vecklar ut sig, utan på vad något är. */
    if (träff && snurrar) setSnurrar(false)
  }

  const släpp = () => {
    drag.current = null
  }

  /* Pekaren lämnar kartan: både dragningen och rutan ska släppa. Utan det
     lyser rutan kvar i kanten när man glidit ut ur bilden. */
  const ut = () => {
    drag.current = null
    setPekad(null)
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

  /* Vad rutan säger, och var pricken den talar om ligger. Samma innehåll som
     den platta kartans knappnål: en dryck heter sitt hela namn och sin stil, en
     grupp sitt namn och sitt antal. Uppslagningen går via nyckeln, för `punkter`
     är en ny lista efter varje vridning. */
  const knappnål = useMemo(() => {
    const p = pekad ? punkter.find((q) => q.nyckel === pekad) : null
    if (!p) return null
    const text = p.grupp
      ? { rubrik: (p.ur as Grupp).namn, under: `${(p.ur as Grupp).antal} st` }
      : { rubrik: heltNamn(p.ur as Produkt), under: grupprad(p.ur as Produkt, karta) }
    return { ...text, px: p.px, py: p.py, r: p.r }
  }, [pekad, punkter, karta])

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
        onPointerLeave={ut}
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
            // se `.karta3d circle` i index.css. Molnets prickar bär sitt id av
            // samma skäl: utan det går hovringen inte att pröva i webbläsaren.
            {...(p.grupp ? { 'data-grupp': p.namn } : { 'data-produkt': (p.ur as Produkt).id })}
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
        {/* Ringen runt den prick rutan talar om. Bara en ring: rutan säger
            redan vad drycken heter, och en etikett i svg:n till vore två svar
            på samma fråga. Den ritas efter prickarna för att en granne i
            förgrunden inte ska måla över svaret man just bett om. */}
        {knappnål && (
          <circle
            className="marke-ring"
            cx={knappnål.px}
            cy={knappnål.py}
            r={(knappnål.r + 5) * luppPrick}
            strokeWidth={1.5 * lupp}
          />
        )}

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
          och kvar är bara det man inte kan se: att man får ta i molnet.

          Ligger en klocka på en axel står gallret också här. Klockorna är
          heltal, så prickarna lägger sig i skivor med tjugo drycker i varje —
          det syns direkt, och den som inte vet varför tror att det är ett fel.
          Hellre skrivet än dolt, och absolut hellre än utsuddat med brus. */}
      <div className="grepp-not">
        dra för att vrida
        {/* Hovringen står bakom samma flagga som zoomen: på en telefon finns
            varken hjul eller pekare, och en not om något som inte går är sämre
            än ingen not. */}
        {smal ? '' : ', rulla för att zooma · peka på en prick för att se vilken'}
        {axel.some((a) => a.sort === 'klocka') &&
          ' · klockorna är heltal, så prickarna lägger sig i skivor'}
      </div>

      {/* Samma ruta som den platta kartan, samma klass och samma innehåll.
          Ligger i sidans rum och inte i svg:ns, så den kan hänga utanför
          ritytan utan att klippas. */}
      {knappnål && (
        <div className="knappnål" style={{ left: pekare.x + 14, top: pekare.y + 14 }}>
          <strong>{knappnål.rubrik}</strong>
          <span>{knappnål.under}</span>
        </div>
      )}
    </div>
  )
}
