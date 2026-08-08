import type { Produkt, Stil } from './typer'

/** Klockornas maxvärden för öl. Samma tal som byggskriptet normaliserar med. */
export const AXLAR = [
  { nyckel: 'beska', etikett: 'beska', max: 10 },
  { nyckel: 'fyllighet', etikett: 'fyllighet', max: 12 },
  { nyckel: 'sötma', etikett: 'sötma', max: 11 },
] as const

export type Axel = (typeof AXLAR)[number]

export function avstånd(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2
  return Math.sqrt(s)
}

/**
 * Produkterna i en stil, mest typiska först — alltså de som ligger närmast
 * stilens egen medelvektor. En "Torr porter och stout" som smakar precis som
 * stilen hamnar överst, en udda fågel längst ned.
 */
export function produkterIStil(produkter: Produkt[], stil: Stil): Produkt[] {
  return produkter
    .filter((p) => p.stil === stil.namn)
    .map((p) => ({ p, d: avstånd(p.vektor, stil.vektor) }))
    .sort((a, b) => a.d - b.d)
    .map(({ p }) => p)
}

/**
 * Grannstilar mäts på kartkoordinaterna, inte på hela vektorn. Det är en
 * medveten eftergift: kartan är en projektion och tappar en del information,
 * men en lista som säger "närmast" måste stämma med det man ser. Annars pekar
 * appen ut en granne som ligger synligt längre bort än en annan.
 */
export function närmasteStilar(stilar: Stil[], stil: Stil, antal = 5): Stil[] {
  return stilar
    .filter((s) => s.namn !== stil.namn)
    .map((s) => ({ s, d: Math.hypot(s.x - stil.x, s.y - stil.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, antal)
    .map(({ s }) => s)
}

/** Sortimentets median per axel, som referens att rita stilens profil emot. */
export function sortimentetsMedian(produkter: Produkt[]): Record<string, number> {
  const ut: Record<string, number> = {}
  for (const { nyckel } of AXLAR) {
    const v = produkter.map((p) => p[nyckel]).sort((a, b) => a - b)
    ut[nyckel] = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
  }
  return ut
}

export const kr = (n: number | null) => (n === null ? '–' : `${Math.round(n)} kr/l`)

/** Svensk notation: 28,90 kr, inte 28.9 kr. */
export const kronor = (n: number) =>
  `${n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`

/**
 * Systembolaget delar upp namnet i två fält: `productNameBold` är varumärket
 * och `productNameThin` själva ölen. Var för sig säger de sällan tillräckligt
 * — "Gotlands Bryggeri" respektive "Wisby Stout" — så de sätts ihop.
 */
export const heltNamn = (p: Produkt) => [p.namn, p.undertitel].filter(Boolean).join(' ')

/** Bryggeriet upprepas inte när det redan står i namnet. Det gäller 1 568 öl. */
export const bryggeriRad = (p: Produkt) =>
  [p.bryggeri === p.namn ? null : p.bryggeri, p.land].filter(Boolean).join(' · ')
