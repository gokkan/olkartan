import type { Grupp, Karta } from './typer'
import { kanalvärde, type Mätt } from './färg'

/**
 * Vad de tre riktningarna i 3D-molnet visar.
 *
 * Länge var svaret givet: x, y och z var kartans tre huvudkomponenter, i den
 * ordningen, och ingenting annat gick att sätta där. Det är fortfarande
 * förvalet — de tre är de riktningar där drycker faktiskt skiljer sig mest åt,
 * och de är de enda tre som är jämförbara med varandra.
 *
 * Men frågan "hur förhåller sig beskan till fylligheten" går inte att ställa
 * till en karta som bara har smakrymden. Färgen rymmer en klocka åt gången,
 * och två klockor mot varandra är en annan bild än en klocka utspridd över
 * smakrymden. Därför går varje axel att sätta till vad som helst kartan kan
 * mäta: en huvudkomponent, en smakklocka, priset eller alkoholhalten.
 *
 * Förbehållet från PLAN.md står kvar och gäller fortfarande. Klockorna är
 * heltal — 267 unika lägen för 3 395 öl — så en klockaxel är ett galler och
 * inte en skala. Det står i noten under molnet i stället för att döljas, och
 * inget brus läggs på för att dölja det.
 */

/** Det axlarna behöver kunna läsa. Både `Grupp` och `Produkt` bär alltihop. */
export type Punkt = Mätt & { x: number; y: number; z: number }

export type Axelval = {
  /** `pc1`–`pc3` för smakrymden, annars färgkanalens nyckel. */
  nyckel: string
  etikett: string
  /** Menyns tre fack. `rymd` är huvudkomponenterna; de andra två är samma
   *  indelning som färgmenyn redan använder. */
  sort: 'rymd' | 'klocka' | 'annat'
  /** Punktens läge längs axeln, i axelns egna enheter. null = värdet saknas. */
  värde: (o: Punkt) => number | null
  /** Orden på spetsarna, [negativ, positiv]. Listor, för en huvudkomponent
   *  namnges av flera ord och en klocka av ett. */
  spetsar: [string[], string[]]
}

export type Axlar = [Axelval, Axelval, Axelval]

/** Standardtrippeln: kartan som den alltid har sett ut. */
export const STANDARD = ['pc1', 'pc2', 'pc3'] as const

/* Ett par kanaler har riktiga motsatsord. "Lite pris" är inte svenska, och en
   axel som säger "billigt → dyrt" säger dessutom mer än en som upprepar
   kanalens namn åt båda hållen. */
const SPETSORD: Record<string, [string, string]> = {
  pris: ['billigt', 'dyrt'],
  abv: ['svag', 'stark'],
}

/**
 * Allt som går att lägga på en axel för den här kartan, huvudkomponenterna
 * först. Kanalerna är samma lista färgmenyn visar — de finns redan på varje
 * grupp och varje produkt, så inget behöver byggas om för att kunna väljas.
 */
export function axelmeny(karta: Karta): Axelval[] {
  /* Huvudkomponenterna heter inte något — de är riktningar, och det enda som
     säger vad de är är orden i dem. "Smakrymd 2" är ingen upplysning; "söt, fat
     → örter, aprikos" är den axel man faktiskt känner igen från kartan. Numret
     står kvar först ändå, för det är det som säger vilken som är störst. */
  const rymd: Axelval[] = karta.axlar.map((a, i) => ({
    nyckel: 'pc' + (i + 1),
    etikett: `${i + 1}: ${a.negativ[0]} → ${a.positiv[0]}`,
    sort: 'rymd',
    värde: (o) => (i === 0 ? o.x : i === 1 ? o.y : o.z),
    spetsar: [a.negativ, a.positiv],
  }))
  const kanaler: Axelval[] = karta.färgkanaler.map((k) => ({
    nyckel: k.nyckel,
    etikett: k.etikett,
    sort: k.sort,
    /* Priset räknas logaritmiskt, av samma skäl som i färgskalan: linjärt
       trängs nittio procent av sortimentet ihop i ena änden och en handfull
       flaskor äger resten av axeln. */
    värde: (o) => {
      const rå = kanalvärde(o, k.nyckel)
      return rå === null ? null : k.logg ? Math.log(Math.max(1, rå)) : rå
    },
    spetsar: SPETSORD[k.nyckel]
      ? [[SPETSORD[k.nyckel][0]], [SPETSORD[k.nyckel][1]]]
      : [[`lite ${k.etikett}`], [`mycket ${k.etikett}`]],
  }))
  return [...rymd, ...kanaler]
}

/**
 * Trippeln ur adressen, position för position.
 *
 * En nyckel kartan inte har faller tillbaka till huvudkomponenten på just den
 * platsen. Beska finns inte för vin, och en länk som bytt karta ska ge en
 * läsbar karta och inte ett tomt moln — samma hållning som färgvalet har.
 */
export function tolkaAxlar(karta: Karta, s?: string): Axlar {
  const meny = axelmeny(karta)
  const bitar = (s ?? '').split(',')
  return STANDARD.map(
    (standard, i) =>
      meny.find((a) => a.nyckel === bitar[i]) ?? meny.find((a) => a.nyckel === standard)!,
  ) as Axlar
}

/** Motsatsen. Standardtrippeln tar bort nyckeln helt, så vanliga länkar
 *  förblir korta — samma mönster som landfiltret. */
export const skrivAxlar = (tre: string[]): string | undefined =>
  tre.length === 3 && tre.every((n, i) => n === STANDARD[i]) ? undefined : tre.join(',')

/** Vad rymden mäter: var mitten ligger, vad en enhet är på varje axel, och
 *  hur många ritenheter en enhet blir. */
export type Rymd = {
  mitt: [number, number, number]
  enhet: [number, number, number]
  skala: number
  /** Radien i det normaliserade rummet. Gånger skalan blir det ritytans radie. */
  djup: number
}

/**
 * Molnets mitt och skala.
 *
 * Vridningen sker kring tyngdpunkten, inte kring lådans mitt: prickarna ligger
 * inte jämnt, och med lådans mitt som nav skulle den täta delen svepa fram och
 * tillbaka över skärmen medan man vrider.
 *
 * Enheten är det som är nytt. Så länge alla tre axlarna kommer ur samma PCA är
 * den 1 på alla tre — då är axlarna redan jämförbara, och en enhetlig skala är
 * det enda ärliga: ett moln som deformeras när det vrids ljuger om varje
 * avstånd utom de två man råkar titta rakt på. Blandas en klocka in är
 * avstånden ändå inte jämförbara mellan axlarna, och då normaliseras varje
 * axel mot sin egen utbredning så att molnet fyller sfären i stället för att
 * bli en tunn skiva. Foten under kartan säger vilket av de två som gäller.
 *
 * Med enheten 1 är räkningen nedan taltroget densamma som innan axlarna gick
 * att välja — det är vad enhetstestet mäter.
 */
export function rymdmått(grupper: Grupp[], axel: Axlar, radie: number): Rymd {
  const vikt = grupper.reduce((s, p) => s + p.antal, 0) || 1
  const mitt = axel.map(
    (a) => grupper.reduce((s, p) => s + (a.värde(p) ?? 0) * p.antal, 0) / vikt,
  ) as [number, number, number]

  const enhetlig = axel.every((a) => a.sort === 'rymd')
  const enhet = axel.map((a, i) =>
    enhetlig
      ? 1
      : Math.max(...grupper.map((p) => Math.abs((a.värde(p) ?? mitt[i]) - mitt[i]))) || 1,
  ) as [number, number, number]

  const djup =
    Math.max(
      ...grupper.map((p) =>
        Math.hypot(...axel.map((a, i) => ((a.värde(p) ?? mitt[i]) - mitt[i]) / enhet[i])),
      ),
    ) || 1
  return { mitt, enhet, skala: radie / djup, djup }
}

/**
 * Punktens läge i det lokala, skalade rummet — det `rotera` sedan vrider.
 *
 * null när någon av de tre axlarna saknar värde för punkten. Det händer bara
 * för priset, och bara för de få produkter Systembolaget inte anger volym för.
 * De utelämnas hellre än läggs på mitten: en prick på en plats den inte hör
 * hemma på är sämre än ingen prick alls.
 */
export function plats(o: Punkt, axel: Axlar, rymd: Rymd): [number, number, number] | null {
  const ut: number[] = []
  for (let i = 0; i < 3; i++) {
    const v = axel[i].värde(o)
    if (v === null) return null
    ut.push(((v - rymd.mitt[i]) / rymd.enhet[i]) * rymd.skala)
  }
  return ut as [number, number, number]
}
