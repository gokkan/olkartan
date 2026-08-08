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

/**
 * Vilka maträtter som är typiska för en stil.
 *
 * Inte de vanligaste — då står det "sällskapsdryck" på alla 57 stilarna, för
 * nio av tio öl är märkta så. Det som räknas är övervikten mot sortimentet i
 * stort, med ett golv så att en rätt som bara ett par öl bär inte klättrar
 * upp på grund av att den är ovanlig överallt.
 */
export function typiskMat(iStilen: Produkt[], alla: Produkt[], antal = 4): string[] {
  if (iStilen.length < 3) return []
  const räkna = (ps: Produkt[]) => {
    const c = new Map<string, number>()
    for (const p of ps) for (const m of p.mat) c.set(m, (c.get(m) ?? 0) + 1)
    return c
  }
  const här = räkna(iStilen)
  const överallt = räkna(alla)
  return [...här.entries()]
    .filter(([, n]) => n / iStilen.length >= 0.25)
    .map(([m, n]) => [m, n / iStilen.length / ((överallt.get(m) ?? 1) / alla.length)] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, antal)
    .map(([m]) => m)
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
