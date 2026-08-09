import type { Grupp, Karta, Produkt } from './typer'

export function avstånd(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2
  return Math.sqrt(s)
}

/**
 * Produkterna i en grupp, mest typiska först — alltså de som ligger närmast
 * gruppens egen medelvektor. En "Torr porter och stout" som smakar precis som
 * stilen hamnar överst, en udda fågel längst ned.
 */
export function produkterIGrupp(produkter: Produkt[], grupp: Grupp): Produkt[] {
  return produkter
    .filter((p) => p.grupper.includes(grupp.namn))
    .map((p) => ({ p, d: avstånd(p.vektor, grupp.vektor) }))
    .sort((a, b) => a.d - b.d)
    .map(({ p }) => p)
}

/**
 * Grannar mäts på kartkoordinaterna, inte på hela vektorn. Det är en medveten
 * eftergift: kartan är en projektion och tappar en del information, men en
 * lista som säger "närmast" måste stämma med det man ser. Annars pekar appen
 * ut en granne som ligger synligt längre bort än en annan.
 */
export function närmasteGrupper(alla: Grupp[], grupp: Grupp, antal = 5): Grupp[] {
  return alla
    .filter((g) => g.namn !== grupp.namn)
    .map((g) => ({ g, d: Math.hypot(g.x - grupp.x, g.y - grupp.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, antal)
    .map(({ g }) => g)
}

/**
 * Vilka maträtter som är typiska för en grupp.
 *
 * Inte de vanligaste — då står det "sällskapsdryck" på alla 60 ölstilarna, för
 * nio av tio öl är märkta så. Det som räknas är övervikten mot sortimentet i
 * stort, med ett golv så att en rätt som bara ett par produkter bär inte
 * klättrar upp på grund av att den är ovanlig överallt.
 */
export function typiskMat(iGruppen: Produkt[], alla: Produkt[], antal = 4): string[] {
  if (iGruppen.length < 3) return []
  const räkna = (ps: Produkt[]) => {
    const c = new Map<string, number>()
    for (const p of ps) for (const m of p.mat) c.set(m, (c.get(m) ?? 0) + 1)
    return c
  }
  const här = räkna(iGruppen)
  const överallt = räkna(alla)
  return [...här.entries()]
    .filter(([, n]) => n / iGruppen.length >= 0.25)
    .map(([m, n]) => [m, n / iGruppen.length / ((överallt.get(m) ?? 1) / alla.length)] as const)
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
 * och `productNameThin` själva produkten — "Gotlands Bryggeri" respektive
 * "Wisby Stout". Var för sig säger de sällan tillräckligt, så de sätts ihop.
 */
export const heltNamn = (p: Produkt) => [p.namn, p.undertitel].filter(Boolean).join(' ')

/** Producenten upprepas inte när den redan står i namnet. */
export const producentRad = (p: Produkt) =>
  [p.bryggeri === p.namn ? null : p.bryggeri, p.land].filter(Boolean).join(' · ')

/** Vad produkten hör till, som text. En stil, eller flera druvor. */
export const grupprad = (p: Produkt) => p.grupper.join(' · ')

/** Klockvärdena i kartans egen ordning, för staplarna. */
export const klockvärden = (karta: Karta, klockor: Record<string, number>) =>
  karta.klockor.map((k) => ({ ...k, värde: klockor[k.nyckel] ?? 0 }))
