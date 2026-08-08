/**
 * Bygger src/data/*.json ur Systembolagets sortiment.
 *
 * Kör: npm run data
 * Kräver: data/rå/products.json  (npm run data:hämta)
 *
 * Pipelinen i korthet:
 *   1. filtrera fram säljbar öl med smakdata
 *   2. tolka smaktexten till en term-vektor (tf-idf)
 *   3. reducera termrymden till TEXT_KOMPONENTER via SVD
 *   4. slå ihop med klockorna + ABV + syra till en gemensam smakvektor
 *   5. aggregera per stil, PCA till 2D, skriv koordinater
 *
 * Allt är deterministiskt: samma indata ger samma karta varje gång.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Går att peka om, vilket behövs för att jämföra två sortimentsversioner mot
// varandra utan att skriva över den riktiga datan.
const RÅFIL = process.env.RAFIL ? resolve(process.env.RAFIL) : resolve(ROT, 'data/rå/products.json')
const UT = process.env.UT ? resolve(process.env.UT) : ROT

/* ---------------------------------------------------------------- rattar --
 * Ändra här, kör om, titta på kartan. Värdena är framtagna genom att svepa
 * dem mot tre kontroller som körs sist i skriptet — se kontrolleraKarta().
 */
const MIN_DF = 5 // en term måste finnas hos så många öl för att räknas
const TEXT_KOMPONENTER = 8 // dimensioner att behålla ur termrymden
const VIKT_NUM = 0.6 // klockornas tyngd mot texten. Högre suddar stout/IPA.
const VIKT_SYRA = 0.6 // syrans tyngd. Högre skickar surölen ut i egen omloppsbana.
const MIN_PRODUKTER_STIL = 3 // färre än så flaggas som liten, men kastas inte

/* ------------------------------------------------------------ linjär algebra --
 * Egenvektorer via potensiteration med deflation. Ingen extern modul, och
 * fullt deterministiskt så länge startvektorn är det.
 */
function slumpTal(frö) {
  // LCG. Vi vill bara ha en reproducerbar startvektor, inte bra slump.
  let s = frö
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5
}

function kovarians(M) {
  const n = M.length
  const d = M[0].length
  const C = Array.from({ length: d }, () => new Float64Array(d))
  for (const rad of M) {
    for (let i = 0; i < d; i++) {
      if (rad[i] === 0) continue // termmatrisen är gles, det här sparar mycket
      for (let j = i; j < d; j++) C[i][j] += rad[i] * rad[j]
    }
  }
  for (let i = 0; i < d; i++)
    for (let j = i; j < d; j++) {
      C[i][j] /= n - 1
      C[j][i] = C[i][j]
    }
  return C
}

function egenvektorer(C, k, iterationer = 600) {
  const d = C.length
  const nästa = slumpTal(20260808)
  const ut = []
  const A = C.map((r) => Float64Array.from(r))
  for (let komp = 0; komp < k; komp++) {
    let v = Float64Array.from({ length: d }, () => nästa())
    let λ = 0
    for (let it = 0; it < iterationer; it++) {
      const w = new Float64Array(d)
      for (let i = 0; i < d; i++) {
        let s = 0
        for (let j = 0; j < d; j++) s += A[i][j] * v[j]
        w[i] = s
      }
      const norm = Math.hypot(...w)
      if (norm < 1e-12) break
      for (let i = 0; i < d; i++) w[i] /= norm
      λ = norm
      v = w
    }
    // Teckenkonvention: största laddningen är alltid positiv. Utan den kan
    // kartan spegelvändas mellan körningar utan att något annat ändrats.
    let störst = 0
    for (let i = 1; i < d; i++) if (Math.abs(v[i]) > Math.abs(v[störst])) störst = i
    if (v[störst] < 0) for (let i = 0; i < d; i++) v[i] = -v[i]

    ut.push({ vektor: v, egenvärde: λ })
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) A[i][j] -= λ * v[i] * v[j]
  }
  return ut
}

const kolumnMedel = (M) => {
  const d = M[0].length
  const m = new Float64Array(d)
  for (const r of M) for (let i = 0; i < d; i++) m[i] += r[i]
  for (let i = 0; i < d; i++) m[i] /= M.length
  return m
}

const centrera = (M, m) => M.map((r) => Float64Array.from(r, (v, i) => v - m[i]))

const projicera = (M, komponenter) =>
  M.map((r) =>
    komponenter.map((k) => {
      let s = 0
      for (let i = 0; i < r.length; i++) s += r[i] * k.vektor[i]
      return s
    }),
  )

/* ------------------------------------------------------------- smaktexten --
 * Systembolagets smaktexter följer en mall:
 *   "<karaktär>, <karaktär> smak med <styrka>, inslag av <A>, <B> och <C>."
 * Båda halvorna är värda att plocka ut. Karaktärsorden ("rostad", "syrlig")
 * säger vad ölen är; inslagen ("kaffe", "grapefrukt") säger vad den smakar av.
 *
 * Huvudordet är dock inte alltid "smak". 34 öl skriver "rostad öl med inslag
 * av …" eller "humlearomatisk doft med …". Delar man bara på ordet "smak"
 * blir hela meningen ett enda karaktärsord, och skräp som "rostad öl med
 * inslag av pumpernickel" hamnar i termrymden som kartan byggs av.
 */
const HUVUDORD = /^(.*?)\s+(?:smak|öl|doft)\b/i
const LEDNING = /^(något|tydligt|mycket|lite|aningen|påtagligt|smakrik)\s+/

function termer(text) {
  const ut = new Set()
  // Allt före huvudordet är karaktärsord. Saknas huvudordet helt får " med "
  // agera gräns, och i sista hand hela texten.
  const huvud = (text.match(HUVUDORD)?.[1] ?? text.split(/\s+med\s+/)[0] ?? '').trim()
  for (const bit of huvud.split(/,|\soch\s/)) {
    const t = bit.trim().toLowerCase().replace(LEDNING, '')
    // Ett karaktärsord är ett ord, på sin höjd två. Blir det längre har
    // uppdelningen gått fel och biten ska inte in i rymden.
    if (t.length > 2 && t.split(/\s+/).length <= 2) ut.add('K:' + t)
  }
  const m = text.match(/inslag av (.+?)\./i)
  if (m) {
    for (const bit of m[1].split(/,|\soch\s/)) {
      // Enstaka texter upprepar "inslag av" mitt i uppräkningen. Det är
      // stavfel i källan, men de ska inte synas som smakord i gränssnittet.
      const t = bit
        .trim()
        .toLowerCase()
        .replace(/^inslag av /, '')
        .replace(/\.$/, '')
      if (t.length > 2) ut.add('D:' + t)
    }
  }
  return ut
}

/* ------------------------------------------------------------------ färg --
 * Prickens kulör. Systembolagets fritextfält `color` har ett litet ordförråd
 * och gäller per produkt, vilket ger en riktigt mycket bättre färgskala än att
 * mappa hela kategorier till en ton. Ordningen är viktig: mest specifik först,
 * annars fångar "brun" upp "brunsvart".
 */
const FÄRGORD = [
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

function mörkhet(färgtext) {
  if (!färgtext) return null
  const t = färgtext.toLowerCase()
  for (const [re, v] of FÄRGORD) if (re.test(t)) return v
  return null
}

/* ------------------------------------------------------------------ kör --- */

if (!existsSync(RÅFIL)) {
  console.error(`\nHittar inte ${RÅFIL}\nKör  npm run data:hämta  först.\n`)
  process.exit(1)
}

console.log('läser råfil …')
const alla = JSON.parse(readFileSync(RÅFIL, 'utf8'))

const kastat = { ejÖl: 0, utgången: 0, slut: 0, ingenSmakdata: 0, ingenStil: 0 }
const öl = []

for (const p of alla) {
  if (p.categoryLevel1 !== 'Öl') {
    kastat.ejÖl++
    continue
  }
  if (p.isDiscontinued) {
    kastat.utgången++
    continue
  }
  if (p.isCompletelyOutOfStock) {
    kastat.slut++
    continue
  }
  // Smaktexten och klockorna fylls i vid samma tillfälle: saknas den ena
  // saknas i praktiken den andra. Kravet på bitter > 0 fångar båda.
  if (!p.taste || !p.tasteClockBitter) {
    kastat.ingenSmakdata++
    continue
  }
  if (!p.categoryLevel3) {
    kastat.ingenStil++
    continue
  }
  öl.push(p)
}

/* --- samma öl två gånger ------------------------------------------------
 * Sortimentet innehåller samma öl under flera artikelnummer: burk och
 * flaska, två storlekar, och framför allt övergångar där Systembolaget byter
 * artikelnummer och båda ligger kvar ett tag. Pistonhead Kustom Lager finns
 * som artikel från 2011 och en från 2026, identiska i allt utom pantbeloppet.
 *
 * För en smakkarta är enheten "en öl", inte "en artikel". 183 av de 214
 * dubblettgrupperna har dessutom exakt samma smakdata, så sammanslagningen
 * kostar ingenting — den tar bara bort brus ur listorna och ur stilarnas
 * medelvärden.
 *
 * Representanten väljs i tur och ordning: den som går att få tag på, den som
 * finns i fast sortiment, den billigaste per liter, och sist lägsta id så att
 * utfallet blir detsamma vid varje körning.
 */
const perLiter = (p) => (p.volume ? p.price / p.volume : Infinity)
const bättre = (a, b) => {
  if (!!a.isSupplierTemporaryNotAvailable !== !!b.isSupplierTemporaryNotAvailable)
    return a.isSupplierTemporaryNotAvailable ? b : a
  const fastA = a.assortmentText === 'Fast sortiment'
  const fastB = b.assortmentText === 'Fast sortiment'
  if (fastA !== fastB) return fastA ? a : b
  if (perLiter(a) !== perLiter(b)) return perLiter(a) < perLiter(b) ? a : b
  return a.productId <= b.productId ? a : b
}

const unika = new Map()
for (const p of öl) {
  const nyckel = [p.productNameBold, p.productNameThin ?? '', p.producerName ?? ''].join(' ')
  const fanns = unika.get(nyckel)
  unika.set(nyckel, fanns ? bättre(fanns, p) : p)
}
const dubbletter = öl.length - unika.size
öl.length = 0
öl.push(...unika.values())

console.log(
  `  ${alla.length} produkter in, ${öl.length} öl kvar (${dubbletter} dubbletter slogs ihop)\n`,
)

/* --- termrymd ---------------------------------------------------------- */
const df = new Map()
const termerPer = öl.map((p) => {
  const t = termer(p.taste)
  for (const x of t) df.set(x, (df.get(x) ?? 0) + 1)
  return t
})
const vokabulär = [...df.entries()]
  .filter(([, n]) => n >= MIN_DF)
  .map(([t]) => t)
  .sort()
const termIndex = new Map(vokabulär.map((t, i) => [t, i]))

const T = termerPer.map((ts) => {
  const rad = new Float64Array(vokabulär.length)
  for (const t of ts) {
    const i = termIndex.get(t)
    if (i !== undefined) rad[i] = Math.log(öl.length / df.get(t))
  }
  // L2-normalisera så att en öl med sju inslag inte väger tyngre än en med tre
  const norm = Math.hypot(...rad) || 1
  for (let i = 0; i < rad.length; i++) rad[i] /= norm
  return rad
})

console.log(`termrymd: ${vokabulär.length} termer (av ${df.size} unika, tröskel ${MIN_DF})`)
const Tm = kolumnMedel(T)
const Tc = centrera(T, Tm)
const textKomp = egenvektorer(kovarians(Tc), TEXT_KOMPONENTER)
let TX = projicera(Tc, textKomp)

// Standardisera varje textkomponent, annars dominerar den första allt.
const txSd = TX[0].map((_, i) => {
  const m = TX.reduce((s, r) => s + r[i], 0) / TX.length
  return Math.sqrt(TX.reduce((s, r) => s + (r[i] - m) ** 2, 0) / TX.length) || 1
})
TX = TX.map((r) => r.map((v, i) => v / txSd[i]))

/* --- numeriska axlar --------------------------------------------------- */
// Klockorna har olika maxvärden för öl: beska 10, fyllighet 12, sötma 11.
const syraAv = (p) =>
  p.categoryLevel2 === 'Syrlig öl'
    ? 1
    : /syrlig|sur\b/.test(p.taste.slice(0, 40).toLowerCase())
      ? 0.7
      : 0

const NUM = öl.map((p) => [
  p.tasteClockBitter / 10,
  p.tasteClockBody / 12,
  p.tasteClockSweetness / 11,
  Math.min(p.alcoholPercentage ?? 0, 15) / 15,
  syraAv(p),
])
const numMedel = kolumnMedel(NUM)
const numSd = numMedel.map((m, i) => {
  const v = NUM.reduce((s, r) => s + (r[i] - m) ** 2, 0) / NUM.length
  return Math.sqrt(v) || 1
})
const NUMz = NUM.map((r) => r.map((v, i) => (v - numMedel[i]) / numSd[i]))

/* --- gemensam smakvektor ------------------------------------------------ */
const V = TX.map((t, i) => [...t, ...NUMz[i].map((v, j) => v * (j === 4 ? VIKT_SYRA : VIKT_NUM))])

/* --- stilar ------------------------------------------------------------- */
const perStil = new Map()
öl.forEach((p, i) => {
  const s = p.categoryLevel3
  if (!perStil.has(s)) perStil.set(s, [])
  perStil.get(s).push(i)
})

const stilNamn = [...perStil.keys()].sort()
const stilMedel = stilNamn.map((s) => {
  const idx = perStil.get(s)
  const m = new Float64Array(V[0].length)
  for (const i of idx) for (let j = 0; j < m.length; j++) m[j] += V[i][j]
  for (let j = 0; j < m.length; j++) m[j] /= idx.length
  return m
})

const sm = kolumnMedel(stilMedel)
const sc = centrera(stilMedel, sm)
const kartKomp = egenvektorer(kovarians(sc), 2)
const koord = projicera(sc, kartKomp)
const totalVarians = kartKomp.reduce((s, k) => s + k.egenvärde, 0) / sc[0].length
const varians = kartKomp.map((k) => k.egenvärde)
const variansSum = sc[0]
  .map((_, i) => {
    let s = 0
    for (const r of sc) s += r[i] * r[i]
    return s / (sc.length - 1)
  })
  .reduce((a, b) => a + b, 0)

// Produkternas egna koordinater i samma bas, så att en enskild öl kan placeras
// på kartan bredvid sin stil.
const prodKoord = projicera(
  V.map((r) => Float64Array.from(r, (v, i) => v - sm[i])),
  kartKomp,
)

/* --- etiketter på axlarna ----------------------------------------------
 * En PCA-axel är bara meningsfull om man kan säga vad den mäter. Kartaxlarna
 * är kombinationer av textkomponenterna, så vi kedjar tillbaka laddningarna
 * hela vägen till termerna och låter de tyngsta orden namnge axeln.
 */
function axelOrd(kartKomponent) {
  const bidrag = new Map()
  for (let k = 0; k < TEXT_KOMPONENTER; k++) {
    const vikt = kartKomponent.vektor[k]
    textKomp[k].vektor.forEach((laddning, t) => {
      bidrag.set(vokabulär[t], (bidrag.get(vokabulär[t]) ?? 0) + (vikt * laddning) / txSd[k])
    })
  }
  const sorterat = [...bidrag.entries()].sort((a, b) => a[1] - b[1])
  const rensa = (par) => par.map(([t]) => t.slice(2))
  return { negativ: rensa(sorterat.slice(0, 6)), positiv: rensa(sorterat.slice(-6).reverse()) }
}
const axlar = kartKomp.map(axelOrd)

/* --- skriv ut ----------------------------------------------------------- */
const prisPerLiter = (p) => (p.volume ? +((p.price / p.volume) * 1000).toFixed(2) : null)
const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

const produkter = öl.map((p, i) => ({
  id: p.productId,
  namn: p.productNameBold,
  undertitel: p.productNameThin || null,
  bryggeri: p.producerName,
  land: p.country,
  stil: p.categoryLevel3,
  förälder: p.categoryLevel2,
  abv: p.alcoholPercentage,
  pris: p.price,
  volym: p.volume,
  prisPerLiter: prisPerLiter(p),
  sortiment: p.assortmentText,
  beska: p.tasteClockBitter,
  fyllighet: p.tasteClockBody,
  sötma: p.tasteClockSweetness,
  syra: +syraAv(p).toFixed(2),
  fatlagrad: (p.tasteClockCasque ?? 0) > 1,
  // Systembolagets egen matchning mot maträtter. Enda fältet i katalogen som
  // säger något om ölen som kartan inte redan vet — den bygger på smaktexten,
  // det här på vad någon på Systembolaget tycker att ölen passar till.
  // Ligger utanför kartan med flit: matchningen är grov och skulle dra ihop
  // stilar som inte smakar lika.
  mat: [...new Set(p.tasteSymbols ?? [])].sort(),
  mörkhet: mörkhet(p.color),
  smaktext: p.taste,
  // Prefixen K: och D: skiljer karaktärsord från inslag i termrymden, men
  // efter att de kapats kan samma ord förekomma två gånger — 'kaffe' kan vara
  // både karaktär och inslag. Unika värden ut.
  termer: [...new Set([...termerPer[i]].map((t) => t.slice(2)))].sort(),
  // Inslagen för sig. Karaktärsorden är adjektiv ("rostad", "knäckig") och
  // inslagen substantiv ("kaffe", "kavring"); de kan inte stå i samma
  // uppräkning på svenska. Likhetsmotorn bygger sina meningar av inslagen.
  smakord: [...termerPer[i]]
    .filter((t) => t.startsWith('D:'))
    .map((t) => t.slice(2))
    .sort(),
  vektor: V[i].map((v) => +v.toFixed(4)),
  x: +prodKoord[i][0].toFixed(4),
  y: +prodKoord[i][1].toFixed(4),
}))

const stilar = stilNamn.map((namn, i) => {
  const idx = perStil.get(namn)
  const ps = idx.map((j) => öl[j])
  const mörk = idx.map((j) => produkter[j].mörkhet).filter((v) => v !== null)
  // Vilka termer är typiska för just den här stilen, jämfört med alla öl?
  const lokal = new Map()
  for (const j of idx) for (const t of termerPer[j]) lokal.set(t, (lokal.get(t) ?? 0) + 1)
  const kännetecken = [...lokal.entries()]
    .map(([t, n]) => [t, n / idx.length / (df.get(t) / öl.length)])
    .filter(([t]) => df.get(t) >= MIN_DF)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t.slice(2))
  const unika = [...new Set(kännetecken)].slice(0, 6)

  return {
    namn,
    förälder: ps[0].categoryLevel2,
    antal: idx.length,
    liten: idx.length < MIN_PRODUKTER_STIL,
    x: +koord[i][0].toFixed(4),
    y: +koord[i][1].toFixed(4),
    beska: +median(ps.map((p) => p.tasteClockBitter)).toFixed(1),
    fyllighet: +median(ps.map((p) => p.tasteClockBody)).toFixed(1),
    sötma: +median(ps.map((p) => p.tasteClockSweetness)).toFixed(1),
    syra: +median(idx.map((j) => produkter[j].syra)).toFixed(2),
    abv: +median(ps.map((p) => p.alcoholPercentage ?? 0)).toFixed(1),
    prisPerLiter: +median(ps.map(prisPerLiter).filter(Boolean)).toFixed(0),
    mörkhet: mörk.length ? +median(mörk).toFixed(2) : null,
    kännetecken: unika,
    vektor: [...stilMedel[i]].map((v) => +v.toFixed(4)),
  }
})

/* Hur många öl varje smakord förekommer hos. Likhetsmotorn använder det för
 * att välja vilka ord som är värda att nämna: "delar kaffe och kavring" säger
 * något om två öl, "delar frukt och kryddor" säger ingenting — de orden finns
 * hos halva sortimentet. Prefixet kapas här, så K:kaffe och D:kaffe slås ihop
 * till ett tal. */
const ordfrekvens = {}
for (const [term, n] of df) {
  const ord = term.slice(2)
  ordfrekvens[ord] = (ordfrekvens[ord] ?? 0) + n
}

/* Hur många öl varje maträtt är märkt för. Sökningen behöver talen innan
 * produkterna hunnit hämtas, så de går in i meta. */
const matfrekvens = {}
for (const p of produkter) for (const m of p.mat) matfrekvens[m] = (matfrekvens[m] ?? 0) + 1

const meta = {
  byggd: new Date().toISOString().slice(0, 10),
  antalProdukter: produkter.length,
  antalStilar: stilar.length,
  varians: varians.map((v) => +(v / variansSum).toFixed(3)),
  axlar: axlar.map((a, i) => ({ komponent: i + 1, ...a })),
  rattar: { MIN_DF, TEXT_KOMPONENTER, VIKT_NUM, VIKT_SYRA },
  ordfrekvens,
  matfrekvens,
}

// Stilarna är små och behövs direkt — de byggs in. Produkterna är 2,3 MB och
// behövs först vid ett klick, så de läggs i public/ och hämtas då. Kartan
// målas utan att vänta på dem.
mkdirSync(resolve(UT, 'public/data'), { recursive: true })
mkdirSync(resolve(UT, 'src/data'), { recursive: true })
writeFileSync(resolve(UT, 'public/data/produkter.json'), JSON.stringify(produkter))
writeFileSync(resolve(UT, 'src/data/stilar.json'), JSON.stringify(stilar, null, 1))
writeFileSync(resolve(UT, 'src/data/meta.json'), JSON.stringify(meta, null, 1))

/* --- sammanfattning ----------------------------------------------------- */
const r = (n) => String(n).padStart(6)
console.log(`
kastade produkter
  ej öl              ${r(kastat.ejÖl)}
  utgången ur sortiment ${r(kastat.utgången)}
  helt slut          ${r(kastat.slut)}
  saknar smakdata    ${r(kastat.ingenSmakdata)}
  saknar stil        ${r(kastat.ingenStil)}

skrev
  produkter.json     ${r(produkter.length)}
  stilar.json        ${r(stilar.length)}   varav små (<${MIN_PRODUKTER_STIL}): ${stilar.filter((s) => s.liten).length}
  färg satt på       ${r(produkter.filter((p) => p.mörkhet !== null).length)} produkter
  mat satt på        ${r(produkter.filter((p) => p.mat.length).length)} produkter

kartans varians    PC1 ${(meta.varians[0] * 100).toFixed(0)}%   PC2 ${(meta.varians[1] * 100).toFixed(0)}%   tillsammans ${((meta.varians[0] + meta.varians[1]) * 100).toFixed(0)}%
  vänster  ${axlar[0].negativ.join(', ')}
  höger    ${axlar[0].positiv.join(', ')}
  ned      ${axlar[1].negativ.join(', ')}
  upp      ${axlar[1].positiv.join(', ')}`)

const störst = [...stilar].sort((a, b) => b.antal - a.antal)
console.log('\nstörsta stilarna')
for (const s of störst.slice(0, 5)) console.log(`  ${r(s.antal)}  ${s.namn}`)
console.log('minsta stilarna')
for (const s of störst.slice(-5)) console.log(`  ${r(s.antal)}  ${s.namn}`)

/* --- kontroller ---------------------------------------------------------
 * Kartan ska stämma med hur öl faktiskt smakar. De här tre kontrollerna är
 * acceptanskriteriet för fas 1, körda automatiskt vid varje bygge. Avstånden
 * mäts i enheter av kartans egen spridning så att de går att jämföra mellan
 * körningar även om rattarna ändras.
 */
const pos = new Map(stilar.map((s) => [s.namn, [s.x, s.y]]))
const spridning =
  [0, 1].reduce((s, d) => {
    const v = stilar.map((x) => (d ? x.y : x.x))
    const m = v.reduce((a, b) => a + b, 0) / v.length
    return s + Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length)
  }, 0) / 2

const avstånd = (a, b) => {
  if (!pos.has(a) || !pos.has(b)) return null
  const [x1, y1] = pos.get(a)
  const [x2, y2] = pos.get(b)
  return Math.hypot(x1 - x2, y1 - y2) / spridning
}

const kontroller = [
  [
    'mörkt rostat skilt från humlebeskt',
    'Torr porter och stout',
    'India pale ale (IPA)',
    (d) => d > 0.8,
  ],
  ['ljusa lager ligger ihop', 'Pilsner - tysk stil', 'Dortmunder och helles', (d) => d < 0.5],
  [
    'stout-släktet håller ihop',
    'Torr porter och stout',
    'Imperial porter och stout',
    (d) => d < 1.5,
  ],
  ['veteölen ligger ihop', 'Hefeweizen', 'Witbier', (d) => d < 0.6],
  ['suröl långt från ljus lager', 'Gueuze', 'Pilsner - tysk stil', (d) => d > 1.5],
]

console.log('\nkontroller')
let fel = 0
for (const [namn, a, b, ok] of kontroller) {
  const d = avstånd(a, b)
  if (d === null) {
    console.log(`  ?  ${namn} (stil saknas)`)
    continue
  }
  const bra = ok(d)
  if (!bra) fel++
  console.log(`  ${bra ? '✓' : '✗'}  ${namn}  (${d.toFixed(2)})`)
}
console.log(
  fel === 0
    ? '\nklart. kartan klarar alla kontroller.\n'
    : `\n${fel} kontroll(er) missade — justera VIKT_NUM eller VIKT_SYRA och kör om.\n`,
)
