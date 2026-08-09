/**
 * Vad som skiljer en karta från en annan.
 *
 * Pipelinen i bygg-data.mjs är densamma för öl som för vin: tolka smaktexten,
 * tf-idf, PCA till åtta komponenter, väg in de numeriska axlarna, aggregera
 * per grupp, PCA till 2D. Det som skiljer står här — vilka produkter som är
 * med, vad en prick är, vilka klockor som finns, och vad som ska kontrolleras
 * innan kartan får publiceras.
 *
 * Tre saker gör vin till en annan karta än öl, inte samma karta med andra
 * produkter:
 *
 * 1. Rött och vitt har olika klockor. Rött mäter strävhet, vitt mäter sötma,
 *    och de är inte samma axel. Att lägga dem i samma rymd skulle kräva att
 *    den saknade axeln räknas som noll, vilket är att påstå att alla röda
 *    viner är osöta. Därför två kartor.
 *
 * 2. Vinets `categoryLevel3` är redan en smakklassning — "Fruktigt & Smakrikt",
 *    "Kryddigt & Mustigt". Att aggregera på den vore cirkulärt: smakhärledda
 *    positioner mot smakhärledda kategorier. Druvan är den ärliga enheten.
 *
 * 3. Ett vin kan ha flera druvor. En öl har en stil, men en Bordeaux är
 *    cabernet *och* merlot, och båda druvorna ska räkna vinet som sitt. Därför
 *    är gruppen en lista, inte ett värde.
 */

/** Karaktärsordens ledord, som stryks: "något syrlig" är samma ord som "syrlig". */
export const LEDNING = /^(något|tydligt|mycket|lite|aningen|påtagligt|smakrik)\s+/

/**
 * Prickens kulör per dryck. Systembolagets fritextfält `color` har ett litet
 * ordförråd och gäller per produkt, vilket ger en mycket bättre skala än att
 * mappa hela kategorier till en ton. Ordningen är viktig: mest specifik först,
 * annars fångar "brun" upp "brunsvart".
 *
 * Talet är 0–1 från ljusast till mörkast inom drycken. Appen översätter det
 * till en färg med respektive dryckskala.
 */
const FÄRGORD_ÖL = [
  [/svart|brunsvart/, 1.0],
  [/mörkbrun|mörk,? brun/, 0.85],
  [/brunröd|rödbrun/, 0.68],
  [/brun(?!gul)/, 0.6],
  [/bärnsten|kopparf|brungul/, 0.45],
  [/mörk,? gul|mörkgul|orange/, 0.3],
  [/gyllen|guldgul/, 0.22],
  [/gul/, 0.15],
  [/ljus|halmg|blek/, 0.1],
]

const FÄRGORD_RÖTT = [
  [/blålila/, 1.0],
  [/mörkröd|mörk,? blåröd/, 0.85],
  [/tät/, 0.8],
  [/blåröd|rödblå/, 0.62],
  [/tegel/, 0.4],
  [/mörk/, 0.75],
  [/ljusröd|ljus/, 0.15],
  [/röd/, 0.45],
]

const FÄRGORD_VITT = [
  [/orange|gulorange/, 1.0],
  [/beige/, 0.85],
  [/mörkgul|mörk,? gul/, 0.8],
  [/gyllengul|gyllen/, 0.65],
  [/gul/, 0.45],
  [/ljusgul/, 0.25],
  [/grön/, 0.12],
  [/blek|ljus/, 0.08],
]

const mörkhetAv = (ordlista) => (p) => {
  if (!p.color) return null
  const t = p.color.toLowerCase()
  for (const [re, v] of ordlista) if (re.test(t)) return v
  return null
}

/** Gemensamma skäl att kasta en produkt, oavsett dryck. */
function osäljbar(p) {
  if (p.isDiscontinued) return 'utgången ur sortiment'
  if (p.isCompletelyOutOfStock) return 'helt slut'
  return null
}

/** Klockorna ur `tasteClocks`-arrayen, som är den Systembolaget faktiskt
 *  publicerar. De skalära fälten ligger kvar som nollor även för drycker där
 *  axeln inte används, så de går inte att lita på. */
const klocka = (p, nyckel) => p.tasteClocks?.find((c) => c.key === nyckel)?.value

/**
 * Ett vin räknas till varje druva det är gjort på. Druvorna kommer i
 * Systembolagets ordning, som inte är alfabetisk utan efter andel — den
 * ordningen är värd att behålla i gränssnittet.
 */
const druvor = (p) => [...new Set(p.grapes ?? [])]

/** [svenskt namn, fältet i tasteClocks, maxvärde för den här dryckstypen] */
const vinklockor = (nycklar) =>
  nycklar.map(([nyckel, fält, max]) => ({
    nyckel,
    etikett: nyckel,
    max,
    värde: (p) => klocka(p, fält),
  }))

/* Kontrollerna är kartans acceptanskriterium. De mäts i enheter av kartans
   egen spridning, så att de går att jämföra mellan körningar även om rattarna
   ändras. Går någon sönder efter en ändring säger bygget till direkt i stället
   för att någon upptäcker det med ögat tre veckor senare. */

export const DRYCKER = [
  {
    id: 'ol',
    namn: 'Öl',
    kort: 'öl',
    sida: 'ölkartan',
    enhet: { en: 'öl', flera: 'öl' },
    grupp: { en: 'stil', flera: 'stilar', denna: 'stilen', obestämd: 'en stil' },
    färgskala: 'öl',
    minGrupp: 1,
    litenUnder: 3,
    kasta(p) {
      if (p.categoryLevel1 !== 'Öl') return 'ej öl'
      const o = osäljbar(p)
      if (o) return o
      // Smaktexten och klockorna fylls i vid samma tillfälle: saknas den ena
      // saknas i praktiken den andra. Kravet på beska > 0 fångar båda.
      if (!p.taste || !p.tasteClockBitter) return 'saknar smakdata'
      if (!p.categoryLevel3) return 'saknar stil'
      return null
    },
    grupperAv: (p) => [p.categoryLevel3],
    förälderAv: (p) => p.categoryLevel2,
    dubblettnyckel: (p) => [p.productNameBold, p.productNameThin ?? '', p.producerName ?? ''],
    klockor: [
      { nyckel: 'beska', etikett: 'beska', max: 10, värde: (p) => p.tasteClockBitter },
      { nyckel: 'fyllighet', etikett: 'fyllighet', max: 12, värde: (p) => p.tasteClockBody },
      { nyckel: 'sötma', etikett: 'sötma', max: 11, värde: (p) => p.tasteClockSweetness },
    ],
    // Syran finns inte som klocka för öl — fältet ligger kvar som noll hos
    // samtliga 5 073. Den här regeln är därför skriven för hand, och det är
    // den enda ingången på hela kartan som gissar. Se PLAN.md.
    extra: [
      {
        nyckel: 'syra',
        värde: (p) =>
          p.categoryLevel2 === 'Syrlig öl'
            ? 1
            : /syrlig|sur\b/.test(p.taste.slice(0, 40).toLowerCase())
              ? 0.7
              : 0,
      },
    ],
    mörkhet: mörkhetAv(FÄRGORD_ÖL),
    fatlagrad: (p) => (p.tasteClockCasque ?? 0) > 1,
    kontroller: [
      ['mörkt rostat skilt från humlebeskt', 'Torr porter och stout', 'India pale ale (IPA)', '>', 0.8],
      ['ljusa lager ligger ihop', 'Pilsner - tysk stil', 'Dortmunder och helles', '<', 0.5],
      ['stout-släktet håller ihop', 'Torr porter och stout', 'Imperial porter och stout', '<', 1.5],
      ['veteölen ligger ihop', 'Hefeweizen', 'Witbier', '<', 0.6],
      ['suröl långt från ljus lager', 'Gueuze', 'Pilsner - tysk stil', '>', 1.5],
    ],
  },

  {
    id: 'rott',
    namn: 'Rött vin',
    kort: 'rött',
    sida: 'rödvinskartan',
    enhet: { en: 'vin', flera: 'viner' },
    grupp: { en: 'druva', flera: 'druvor', denna: 'druvan', obestämd: 'en druva' },
    färgskala: 'rött',
    // En druva med två viner är inte en druva på kartan utan ett vin med en
    // etikett. Öl slipper den gränsen: där är tre av sextio stilar små, här
    // vore sextio av hundrafyrtio det.
    minGrupp: 5,
    litenUnder: 8,
    kasta(p) {
      if (p.categoryLevel2 !== 'Rött vin') return 'ej rött vin'
      const o = osäljbar(p)
      if (o) return o
      if (!p.taste) return 'saknar smaktext'
      if (klocka(p, 'TasteClockBody') === undefined) return 'saknar klockor'
      if (!druvor(p).length) return 'saknar druva'
      return null
    },
    grupperAv: druvor,
    förälderAv: (p) => p.country,
    // Årgången hör till nyckeln för vin men inte för öl. Två årgångar av samma
    // vin har olika smaktext och är två viner på kartan; två burkstorlekar av
    // samma öl är en öl.
    dubblettnyckel: (p) => [
      p.productNameBold,
      p.productNameThin ?? '',
      p.producerName ?? '',
      p.vintage ?? '',
    ],
    klockor: vinklockor([
      ['fyllighet', 'TasteClockBody', 11],
      ['strävhet', 'TasteClockRoughness', 11],
      ['fruktsyra', 'TasteClockFruitacid', 11],
    ]),
    extra: [],
    mörkhet: mörkhetAv(FÄRGORD_RÖTT),
    kontroller: [
      // Shiraz och Syrah är samma druva under två namn. Hamnar de inte ihop
      // är det kartan som är trasig, inte min uppfattning om vin.
      ['shiraz och syrah är samma druva', 'Shiraz', 'Syrah', '<', 0.6],
      ['bordeauxparet ligger ihop', 'Cabernet sauvignon', 'Merlot', '<', 0.8],
      ['rhôneparet ligger ihop', 'Syrah', 'Grenache', '<', 0.8],
      ['lätt burgund skild från fyllig cabernet', 'Pinot noir', 'Cabernet sauvignon', '>', 1.5],
      ['nebbiolos strävhet syns', 'Nebbiolo', 'Merlot', '>', 1.0],
    ],
  },

  {
    id: 'vitt',
    namn: 'Vitt vin',
    kort: 'vitt',
    sida: 'vitvinskartan',
    enhet: { en: 'vin', flera: 'viner' },
    grupp: { en: 'druva', flera: 'druvor', denna: 'druvan', obestämd: 'en druva' },
    färgskala: 'vitt',
    minGrupp: 5,
    litenUnder: 8,
    kasta(p) {
      if (p.categoryLevel2 !== 'Vitt vin') return 'ej vitt vin'
      const o = osäljbar(p)
      if (o) return o
      if (!p.taste) return 'saknar smaktext'
      if (klocka(p, 'TasteClockBody') === undefined) return 'saknar klockor'
      if (!druvor(p).length) return 'saknar druva'
      return null
    },
    grupperAv: druvor,
    förälderAv: (p) => p.country,
    dubblettnyckel: (p) => [
      p.productNameBold,
      p.productNameThin ?? '',
      p.producerName ?? '',
      p.vintage ?? '',
    ],
    klockor: vinklockor([
      ['sötma', 'TasteClockSweetness', 10],
      ['fyllighet', 'TasteClockBody', 10],
      ['fruktsyra', 'TasteClockFruitacid', 11],
    ]),
    extra: [],
    mörkhet: mörkhetAv(FÄRGORD_VITT),
    kontroller: [
      // Alvarinho och Loureiro blandas i vinho verde och odlas på samma
      // sluttningar. Ligger de inte ihop har kartan tappat något.
      ['vinho verde-druvorna ligger ihop', 'Alvarinho', 'Loureiro', '<', 0.6],
      ['fyllig chardonnay skild från stram riesling', 'Chardonnay', 'Riesling', '>', 0.5],
      ['chardonnay närmare chenin än riesling', 'Chardonnay', 'Chenin blanc', '<', 1.2],
      ['sauvignon blanc hör inte till de fylliga', 'Sauvignon blanc', 'Chardonnay', '>', 0.8],
      // Här stod en kontroll som sa att sauvignon blanc och grüner veltliner
      // skulle ligga ihop, för att båda är gröna och syrliga. Kartan sa nej
      // (1,28) och den har rätt: Systembolaget mäter grüner veltliner som
      // fylligare och mindre syrlig än sauvignon blanc, och kartans grannar
      // till sauvignon blanc — alvarinho och loureiro — är mer övertygande
      // än min tumregel. Kontrollen var fel, inte kartan.
    ],
  },
]
