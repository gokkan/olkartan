import type { Klockaxel, Produkt } from './typer'

/**
 * Appens kärna: hitta produkter som liknar en given, och säg i ord vad som
 * skiljer dem åt.
 *
 * Ingen LLM, inget nätverksanrop. Samma två öl ger alltid samma mening, och
 * meningen går att härleda till tal man kan slå upp i datan.
 *
 * Förklaringen har två halvor eftersom klockorna ensamma inte räcker. Med
 * bara tre klocktal blir varje mening en variation på samma tema. Smakorden
 * ur Systembolagets egna beskrivningar är det som säger vad drycken faktiskt
 * smakar av.
 */

/** Under så många klocksteg räknas två öl som lika på den axeln. */
export const TRÖSKEL_SAMMA = 0.8
/** Över så många steg är skillnaden tydlig snarare än svag. */
export const TRÖSKEL_TYDLIG = 2.0

/** Ett smakord måste finnas hos så många produkter för att vara värt att nämna.
 *  Under det är det oftast ett stavfel i källan. */
const MINSTA_FREKVENS = 3

export type Ordfrekvens = Record<string, number>

export type Träff = {
  produkt: Produkt
  avstånd: number
  förklaring: string
}

export function avstånd(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  let s = 0
  for (let i = 0; i < n; i++) s += (a[i] - b[i]) ** 2
  return Math.sqrt(s)
}

const nyckla = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const heltNamn = (p: Produkt) => [p.namn, p.undertitel].filter(Boolean).join(' ')

/**
 * Samma produkt i en annan förpackning är ingen rekommendation. Två produkter
 * räknas som samma när namnen är identiska, eller när bryggeriet är detsamma
 * och det ena namnet ryms i det andra ("Guinness Draught" mot "Guinness
 * Draught Nitro").
 */
export function ärSammaÖl(a: Produkt, b: Produkt): boolean {
  if (a.id === b.id) return true
  const na = nyckla(heltNamn(a))
  const nb = nyckla(heltNamn(b))
  if (na === nb) return true
  if (a.bryggeri && a.bryggeri === b.bryggeri && (na.includes(nb) || nb.includes(na))) return true
  return false
}

/** Svensk uppräkning: ett ord, "x och y", eller "x, y och z". */
function räknaUpp(ord: string[]): string {
  if (ord.length <= 1) return ord[0] ?? ''
  return `${ord.slice(0, -1).join(', ')} och ${ord[ord.length - 1]}`
}

/**
 * Ovanliga ord först. Ett ord som bara två öl i hela sortimentet delar säger
 * mer än ett som finns hos hälften.
 */
function mestSägande(ord: string[], frekvens: Ordfrekvens, antal: number): string[] {
  const räknat = ord.map((o) => ({ o, n: frekvens[o] ?? 0 }))
  const dugliga = räknat.filter((x) => x.n >= MINSTA_FREKVENS)
  // Faller allt bort på frekvenskravet är orden ändå bättre än ingenting.
  const urval = dugliga.length ? dugliga : räknat
  return urval
    .sort((a, b) => a.n - b.n || a.o.localeCompare(b.o, 'sv'))
    .slice(0, antal)
    .map((x) => x.o)
}

type Klockskillnad = { namn: string; diff: number; text: string }

/** Axel för axel, för de axlar där båda produkterna har ett värde. */
export function klockskillnader(bas: Produkt, annan: Produkt, axlar: Klockaxel[]): Klockskillnad[] {
  const ut: Klockskillnad[] = []
  for (const { nyckel, etikett: namn } of axlar) {
    const a = bas.klockor[nyckel]
    const b = annan.klockor[nyckel]
    // Saknar någon av dem värdet går axeln inte att jämföra. Den utelämnas
    // hellre än att räknas som noll skillnad.
    if (typeof a !== 'number' || typeof b !== 'number') continue
    const diff = b - a
    const abs = Math.abs(diff)
    const riktning = diff > 0 ? 'mer' : 'mindre'
    const text =
      abs < TRÖSKEL_SAMMA
        ? `samma ${namn}`
        : abs <= TRÖSKEL_TYDLIG
          ? `något ${riktning} ${namn}`
          : `tydligt ${riktning} ${namn}`
    ut.push({ namn, diff, text })
  }
  return ut
}

/**
 * Meningen om hur två öl skiljer sig åt.
 *
 * Första halvan kommer ur klockorna: den axel där de ligger närmast, följd av
 * de två där de skiljer sig mest. Andra halvan kommer ur smakorden.
 */
export function förklara(
  bas: Produkt,
  annan: Produkt,
  frekvens: Ordfrekvens,
  axlar: Klockaxel[],
): string {
  const skillnader = klockskillnader(bas, annan, axlar)
  const olika = skillnader
    .filter((s) => Math.abs(s.diff) >= TRÖSKEL_SAMMA)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
  const lika = skillnader
    .filter((s) => Math.abs(s.diff) < TRÖSKEL_SAMMA)
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))

  // Bara inslagen, inte karaktärsorden: "Delar mörk choklad och rostad" går
  // inte att säga på svenska när det ena är ett substantiv och det andra ett
  // adjektiv. Karaktären bärs ändå av klockorna och av platsen på kartan.
  const basOrd = new Set(bas.smakord)
  const annanOrd = new Set(annan.smakord)
  const delade = bas.smakord.filter((o) => annanOrd.has(o))
  const extra = annan.smakord.filter((o) => !basOrd.has(o))
  const saknas = bas.smakord.filter((o) => !annanOrd.has(o))

  if (!olika.length && !extra.length && !saknas.length) return 'Nästan identisk smakprofil.'

  const meningar: string[] = []

  // Den närmaste axeln först, sedan de största skillnaderna. Ligger allt inom
  // tröskeln räcker det att säga det en gång.
  const delar = olika.length
    ? [...lika.slice(0, 1).map((s) => s.text), ...olika.slice(0, 2).map((s) => s.text)]
    : skillnader.length
      ? [`samma styrka i ${räknaUpp(axlar.map((a) => a.etikett))}`]
      : []
  if (delar.length) {
    const rad = delar.join(', ')
    meningar.push(rad.charAt(0).toUpperCase() + rad.slice(1) + '.')
  }

  const nämnDelade = mestSägande(delade, frekvens, 2)
  const nämnExtra = mestSägande(extra, frekvens, 2)
  const nämnSaknas = mestSägande(saknas, frekvens, 2)

  const tillägg: string[] = []
  if (nämnExtra.length) tillägg.push(`mer ${räknaUpp(nämnExtra)}`)
  if (nämnSaknas.length) tillägg.push(`mindre ${räknaUpp(nämnSaknas)}`)

  // "mer choklad och mindre lakrits" läser bättre än samma sak med komma.
  // Men innehåller ett led redan ett "och" blir det tre i rad och obegripligt
  // — "mer tallbarr och grapefrukt och mindre kavring och kaffe" — och då
  // binder kommat i stället.
  const binda = (delar: string[]) =>
    delar.some((d) => d.includes(' och ')) ? delar.join(', ') : räknaUpp(delar)

  if (nämnDelade.length) {
    let rad = `Delar ${räknaUpp(nämnDelade)}`
    if (tillägg.length) rad += `, men ${binda(tillägg)}`
    meningar.push(rad + '.')
  } else if (tillägg.length) {
    meningar.push(`Inga gemensamma smakord: ${binda(tillägg)}.`)
  }

  return meningar.join(' ')
}

/**
 * De öl som ligger närmast i den gemensamma smakrymden, med förklaring.
 * Avståndet räknas på hela vektorn — text och klockor tillsammans — inte på
 * kartans två dimensioner, som bara är en projektion av den.
 */
export function liknande(
  bas: Produkt,
  alla: Produkt[],
  frekvens: Ordfrekvens,
  axlar: Klockaxel[],
  antal = 8,
): Träff[] {
  return alla
    .filter((p) => !ärSammaÖl(bas, p))
    .map((p) => ({ produkt: p, d: avstånd(bas.vektor, p.vektor) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, antal)
    .map(({ produkt, d }) => ({
      produkt,
      avstånd: +d.toFixed(4),
      förklaring: förklara(bas, produkt, frekvens, axlar),
    }))
}
