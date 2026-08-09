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
