/**
 * Prickarna bär all kulör; gränssnittet runt omkring håller sig neutralt.
 *
 * Varje karta har sin egen skala, och de kommer ur dryckens eget färgspråk
 * snarare än ur en godtycklig palett. Ölens är SRM, bryggarnas mått: halmgult
 * ligger runt SRM 2, bärnsten runt 10, brunt runt 20, nästan svart över 40.
 * Vinets steg är hämtade ur Systembolagets egna färgord — "blålila", "tegel",
 * "ljusgul", "gyllengul" — samma ord som byggskriptet läser av.
 *
 * Talet in är 0–1 från ljusast till mörkast *inom drycken*. Ett vitt vin på
 * 1,0 är orange, inte svart.
 */

export type Skala = 'öl' | 'rött' | 'vitt'

type Steg = [number, [number, number, number]]

const SKALOR: Record<Skala, Steg[]> = {
  öl: [
    [0.0, [0xf7, 0xe7, 0xa6]], // halm
    [0.15, [0xf2, 0xcd, 0x5c]], // ljus gul
    [0.25, [0xe8, 0xa8, 0x30]], // gyllene
    [0.4, [0xd0, 0x7c, 0x1e]], // bärnsten
    [0.55, [0xa9, 0x53, 0x1c]], // koppar
    [0.7, [0x76, 0x33, 0x17]], // brun
    [0.85, [0x45, 0x1e, 0x12]], // mörkbrun
    [1.0, [0x1c, 0x12, 0x0e]], // nästan svart
  ],
  rött: [
    [0.0, [0xe0, 0x93, 0x86]], // ljusröd
    [0.15, [0xd0, 0x6e, 0x66]], // ljus, klar röd
    [0.4, [0xb5, 0x3a, 0x40]], // tegel
    [0.62, [0x8f, 0x22, 0x40]], // blåröd
    [0.8, [0x64, 0x17, 0x3c]], // tät, mörk
    [1.0, [0x36, 0x10, 0x30]], // blålila, nästan svart
  ],
  vitt: [
    [0.0, [0xe9, 0xf0, 0xc6]], // blek
    [0.12, [0xd8, 0xe6, 0x99]], // grön nyans
    [0.25, [0xf0, 0xe5, 0x96]], // ljusgul
    [0.45, [0xe8, 0xcd, 0x5b]], // gul
    [0.65, [0xdd, 0xad, 0x38]], // gyllengul
    [0.85, [0xc9, 0x8b, 0x3a]], // beige
    [1.0, [0xc2, 0x68, 0x20]], // orange
  ],
}

/**
 * Hur långt in i den mörka änden varje användning får gå.
 *
 * På kartan får en nästan svart prick en ljus kant som håller den synlig. En
 * stapel har ingen kant att luta sig mot — en imperial stout ritad i sin äkta
 * SRM-ton försvinner i sitt eget spår, kontrast 1,03 mot 1,0 för ingen
 * skillnad alls. Taket är satt där kontrasten når 3:1, riktlinjen för
 * grafiska element.
 *
 * Molnets prickar är bara ett par punkter stora och har inte plats för både
 * kant och fyllning; en liten mörk prick blir en ihålig ring. Deras tak ligger
 * högre — det räcker att fyllningen skiljer sig från bakgrunden.
 *
 * Vitt vin behöver inga tak. Ingenting på den skalan är mörkt.
 */
const TAK: Record<Skala, { stapel: number; liten: number; ring: number }> = {
  öl: { stapel: 0.55, liten: 0.84, ring: 0.55 },
  rött: { stapel: 0.6, liten: 0.85, ring: 0.6 },
  vitt: { stapel: 1, liten: 1, ring: 1 },
}

function slåUpp(steg: Steg[], mörkhet: number | null): string {
  const v = Math.min(1, Math.max(0, mörkhet ?? 0.3))
  let i = 0
  while (i < steg.length - 2 && v > steg[i + 1][0]) i++
  const [a, fa] = steg[i]
  const [b, fb] = steg[i + 1]
  const t = b === a ? 0 : (v - a) / (b - a)
  const k = fa.map((c, j) => Math.round(c + (fb[j] - c) * t))
  return `rgb(${k[0]} ${k[1]} ${k[2]})`
}

/**
 * Skalan för en smakklocka, när man färgar kartan efter beska i stället för
 * efter hur mörk drycken är.
 *
 * Den ligger med flit utanför dryckernas färgspråk. Skulle en beskaskala också
 * gå från ljust till mörkbrunt vore det omöjligt att veta vilken av de två
 * avläsningarna man tittar på. Kall och blek betyder lite, varm och ljus
 * betyder mycket — en riktning som inte finns i någon av SRM-skalorna.
 */
const KLOCKSTEG: Steg[] = [
  [0.0, [0x3f, 0x4f, 0x63]], // kall skiffer
  [0.3, [0x5c, 0x77, 0x86]], // dimblå
  [0.55, [0x9a, 0x9b, 0x7c]], // grågrön mitt
  [0.78, [0xd8, 0xa4, 0x4e]], // varm gul
  [1.0, [0xff, 0xe2, 0x9a]], // ljusast
]

/** `t` är 0–1: klockans värde delat med dess max för den här kartan. */
export const klockfärg = (t: number) => slåUpp(KLOCKSTEG, t)

/** Två ändar av skalan, till teckenförklaringen. */
export const KLOCKSKALA = [0, 0.25, 0.5, 0.75, 1].map(klockfärg)

export type Palett = {
  /** Prickens fyllning, i dryckens äkta ton. */
  fyllning: (mörkhet: number | null) => string
  /** Tunn ljus kant, så att en mörk prick inte försvinner mot bakgrunden. */
  kant: (mörkhet: number | null) => string
  /** Staplarnas fyllning, kapad där kontrasten når 3:1. */
  stapel: (mörkhet: number | null) => string
  /** Molnets små prickar, kapade så att de inte blir ihåliga ringar. */
  litenPrick: (mörkhet: number | null) => string
  /** Konturen runt den valda gruppen, som måste synas även när den är mörk. */
  ring: (mörkhet: number | null) => string
}

const paletter = new Map<Skala, Palett>()

export function palett(skala: Skala): Palett {
  const färdig = paletter.get(skala)
  if (färdig) return färdig
  const steg = SKALOR[skala] ?? SKALOR.öl
  const tak = TAK[skala] ?? TAK.öl
  const kapa = (t: number) => (m: number | null) => slåUpp(steg, Math.min(t, m ?? 0.3))
  const ny: Palett = {
    fyllning: (m) => slåUpp(steg, m),
    kant: (m) => {
      const v = Math.min(1, Math.max(0, m ?? 0.3))
      return `rgb(255 255 255 / ${(0.08 + v * 0.28).toFixed(2)})`
    },
    stapel: kapa(tak.stapel),
    litenPrick: kapa(tak.liten),
    ring: kapa(tak.ring),
  }
  paletter.set(skala, ny)
  return ny
}

/* Vad prickarna på kartan färgas efter. Normalt drycken själv — hur mörk den
   är — men man kan byta till en smakklocka och se hur den ligger utspridd över
   kartan. Bara kartan byter; panelen, sökträffarna och kartvalet behåller
   dryckens färg, för där svarar färgen på "vad är det här" och inte på "hur
   mycket beska". Formerna är avsiktligt lika: samma anrop, annan skala. */
type Mätt = {
  mörkhet: number | null
  klockor: Record<string, number>
  abv: number
  prisPerLiter: number | null
}
type Kanal = { nyckel: string; spann: [number, number]; logg?: boolean }

/** Kanalens värde hos en grupp eller en produkt — båda bär samma tre fält. */
export const kanalvärde = (o: Mätt, nyckel: string): number | null =>
  nyckel === 'pris' ? o.prisPerLiter : nyckel === 'abv' ? o.abv : (o.klockor[nyckel] ?? null)

export type Kartfärger = {
  fyllning: (o: Mätt) => string
  kant: (o: Mätt) => string
  litenPrick: (o: Mätt) => string
  ring: (o: Mätt) => string
}

export function kartfärger(skala: Skala, kanal: Kanal | null): Kartfärger {
  const p = palett(skala)
  if (!kanal)
    return {
      fyllning: (o) => p.fyllning(o.mörkhet),
      kant: (o) => p.kant(o.mörkhet),
      litenPrick: (o) => p.litenPrick(o.mörkhet),
      ring: (o) => p.ring(o.mörkhet),
    }
  /* Priset räknas om logaritmiskt. Linjärt hade nittio procent av sortimentet
     trängts ihop i den svala änden och en handfull flaskor ägt resten av
     skalan — skillnaden mellan 60 och 120 kr/l är den som betyder något för
     den som handlar, inte den mellan 800 och 900. */
  const [lo, hi] = kanal.logg ? kanal.spann.map((v) => Math.log(Math.max(1, v))) : kanal.spann
  const t = (o: Mätt) => {
    const rå = kanalvärde(o, kanal.nyckel)
    if (rå === null) return 0
    const v = kanal.logg ? Math.log(Math.max(1, rå)) : rå
    return Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1)))
  }
  return {
    fyllning: (o) => klockfärg(t(o)),
    // Kanalskalan har inga mörka ändar att rädda, så kanten kan vara samma för
    // alla — den finns bara för att skilja prickar som ligger på varandra.
    kant: () => 'rgb(255 255 255 / 0.22)',
    litenPrick: (o) => klockfärg(t(o)),
    ring: (o) => klockfärg(Math.max(0.55, t(o))),
  }
}
