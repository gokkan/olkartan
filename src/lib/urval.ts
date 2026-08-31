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
 *
 * Vänd på listan och man får det andra svaret: vilka som avviker mest från sin
 * egen stil. Det är samma sortering läst bakifrån, så det behövs ingen andra
 * lista — bara en knapp som byter håll.
 */
export function produkterIGrupp(produkter: Produkt[], grupp: Grupp, udda = false): Produkt[] {
  const sorterad = produkter
    .filter((p) => p.grupper.includes(grupp.namn))
    .map((p) => ({ p, d: avstånd(p.vektor, grupp.vektor) }))
    .sort((a, b) => a.d - b.d)
    .map(({ p }) => p)
  return udda ? sorterad.reverse() : sorterad
}

/**
 * Den grupp en produkt ligger närmast, bortsett från sin egen.
 *
 * Ligger den närmare den än sin egen är det värt att säga: en julbock som
 * mäter närmare torr porter och stout än ljus bocköl är antingen felmärkt
 * eller en gränsgångare, och båda är intressanta. Avståndet räknas i hela
 * smakrymden, som allt annat som handlar om likhet.
 */
export function främmandeGrupp(
  p: Produkt,
  alla: Grupp[],
): { grupp: Grupp; närmare: number } | null {
  const egen = alla.filter((g) => p.grupper.includes(g.namn))
  if (!egen.length) return null
  const tillEgen = Math.min(...egen.map((g) => avstånd(p.vektor, g.vektor)))
  let bäst: { grupp: Grupp; d: number } | null = null
  for (const g of alla) {
    if (p.grupper.includes(g.namn)) continue
    const d = avstånd(p.vektor, g.vektor)
    if (!bäst || d < bäst.d) bäst = { grupp: g, d }
  }
  if (!bäst || bäst.d >= tillEgen) return null
  return { grupp: bäst.grupp, närmare: tillEgen - bäst.d }
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

/**
 * Adressen till Systembolagets egen sida om produkten.
 *
 * Formen är `/produkt/<kategori>/<slug>-<produktnummer>/`. Bara numret bär
 * någon information: `/produkt/ol/nagot-helt-annat-126015/` visar Guinness
 * Draught precis som den riktiga slugen gör. Slugen är alltså dekoration —
 * men en länk man kopierar och klistrar in någon annanstans ska gå att läsa,
 * så den skrivs ut ändå. Att den kan bli inaktuell om produkten byter namn
 * spelar därför ingen roll.
 *
 * Numret är `nummer`, inte `id`. Se byggskriptet: Systembolaget har två
 * nummer per produkt och deras bildserver och deras webbplats använder var
 * sitt.
 */
export const slugga = (s: string) =>
  s
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const systembolagetLänk = (p: Produkt, karta: Karta) =>
  `https://www.systembolaget.se/produkt/${karta.sbVäg}/${slugga(p.namn)}-${p.nummer}/`

/** Producenten upprepas inte när den redan står i namnet. */
export const producentRad = (p: Produkt) =>
  [p.bryggeri === p.namn ? null : p.bryggeri, p.land].filter(Boolean).join(' · ')

/**
 * Vad produkten hör till, som text. En stil, eller flera druvor.
 *
 * Den kan också höra till ingenting: 263 röda viner har tomt druvfält hos
 * Systembolaget, och 21 öl saknar stil. De ligger ändå på kartan — smaktexten
 * räcker för en plats. Raden säger då vad som saknas, inte ingenting alls.
 */
export const grupprad = (p: Produkt, karta: Karta) =>
  p.grupper.join(' · ') || `${karta.grupp.en} ej angiven`

/** Klockvärdena i kartans egen ordning, för staplarna. */
export const klockvärden = (karta: Karta, klockor: Record<string, number>) =>
  karta.klockor.map((k) => ({ ...k, värde: klockor[k.nyckel] ?? 0 }))
