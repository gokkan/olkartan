/**
 * Bygger kartornas data ur Systembolagets sortiment.
 *
 * Kör: npm run data
 * Kräver: data/rå/products.json  (npm run data:hämta)
 *
 * Pipelinen i korthet, en gång per dryck i scripts/drycker.mjs:
 *   1. filtrera fram säljbara produkter med smakdata
 *   2. tolka smaktexten till en term-vektor (tf-idf)
 *   3. reducera termrymden till TEXT_KOMPONENTER via PCA
 *   4. slå ihop med klockorna + ABV + eventuella extraaxlar
 *   5. aggregera per grupp — stil för öl, druva för vin — PCA till 2D
 *
 * Allt är deterministiskt: samma indata ger samma karta varje gång.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DRYCKER, LEDNING } from './drycker.mjs'

const ROT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Går att peka om, vilket behövs för att jämföra två sortimentsversioner mot
// varandra utan att skriva över den riktiga datan.
const RÅFIL = process.env.RAFIL ? resolve(process.env.RAFIL) : resolve(ROT, 'data/rå/products.json')
const UT = process.env.UT ? resolve(process.env.UT) : ROT
// Bygg bara en karta: DRYCK=rott npm run data
const BARA = process.env.DRYCK

/* ---------------------------------------------------------------- rattar --
 * Ändra här, kör om, titta på kartan. Värdena är framtagna genom att svepa
 * dem mot kontrollerna som varje dryck definierar och som körs sist.
 */
const MIN_DF = 5 // en term måste finnas hos så många produkter för att räknas
const TEXT_KOMPONENTER = 8 // dimensioner att behålla ur termrymden
const VIKT_NUM = 0.6 // klockornas tyngd mot texten. Högre suddar stout/IPA.
const VIKT_EXTRA = 0.6 // extraaxlarnas tyngd. För öl: syran.

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
 * Systembolagets smaktexter följer en mall, och samma mall för vin som för öl:
 *   "<karaktär>, <karaktär> smak med <styrka>, inslag av <A>, <B> och <C>."
 * Båda halvorna är värda att plocka ut. Karaktärsorden ("rostad", "syrlig")
 * säger vad drycken är; inslagen ("kaffe", "grapefrukt") vad den smakar av.
 *
 * Huvudordet är dock inte alltid "smak". 34 öl skriver "rostad öl med inslag
 * av …" eller "humlearomatisk doft med …". Delar man bara på ordet "smak"
 * blir hela meningen ett enda karaktärsord, och skräp som "rostad öl med
 * inslag av pumpernickel" hamnar i termrymden som kartan byggs av.
 */
const HUVUDORD = /^(.*?)\s+(?:smak|öl|doft)\b/i

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

/* ------------------------------------------------------------------ kör --- */

if (!existsSync(RÅFIL)) {
  console.error(`\nHittar inte ${RÅFIL}\nKör  npm run data:hämta  först.\n`)
  process.exit(1)
}

console.log('läser råfil …')
const alla = JSON.parse(readFileSync(RÅFIL, 'utf8'))
const prisPerLiter = (p) => (p.volume ? +((p.price / p.volume) * 1000).toFixed(2) : null)
const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const r6 = (n) => String(n).padStart(6)

function byggKarta(dryck) {
  // Druvläsaren behöver hela sortimentet innan något filtreras bort — den
  // bygger sitt ordförråd ur de viner som har druvan angiven.
  dryck.förbered?.(alla)
  const kastat = new Map()
  const räkna = (skäl) => kastat.set(skäl, (kastat.get(skäl) ?? 0) + 1)
  let valda = []
  for (const p of alla) {
    const skäl = dryck.kasta(p)
    if (skäl) räkna(skäl)
    else valda.push(p)
  }

  /* --- samma produkt två gånger ------------------------------------------
   * Sortimentet innehåller samma dryck under flera artikelnummer: burk och
   * flaska, två storlekar, och framför allt övergångar där Systembolaget byter
   * artikelnummer och båda ligger kvar ett tag. Pistonhead Kustom Lager finns
   * som artikel från 2011 och en från 2026, identiska i allt utom pantbeloppet.
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
  /* Gruppen hör till drycken, inte till artikeln. Systembolaget kan ha druvan
     ifylld på det ena artikelnumret och tomt på det andra, och representanten
     väljs på om vinet går att köpa — inte på hur välskött posten är. Utan
     unionen här tappade rödvinskartan en druva så fort de druvlösa vinerna
     fick vara kvar: representanten råkade bli den tomma posten. */
  const unionPer = new Map()
  for (const p of valda) {
    const nyckel = dryck.dubblettnyckel(p).join(' ')
    const fanns = unika.get(nyckel)
    unika.set(nyckel, fanns ? bättre(fanns, p) : p)
    const g = unionPer.get(nyckel) ?? []
    for (const x of dryck.grupperAv(p)) if (!g.includes(x)) g.push(x)
    unionPer.set(nyckel, g)
  }
  const dubbletter = valda.length - unika.size
  const grupperna = new Map([...unika].map(([nyckel, p]) => [p, unionPer.get(nyckel)]))
  valda = [...unika.values()]

  /* --- vilka grupper som är grupper --------------------------------------
   * En grupp med två produkter är ingen punkt på kartan utan en produkt med
   * en etikett, och dess mittpunkt är produktens egna egenheter. Öl klarar
   * gränsen 1 — tre av sextio stilar är små. Vin gör det inte: sextio av
   * hundrafyrtio druvor har färre än fem viner.
   *
   * Produkten kastas däremot inte för att gruppen faller bort, och inte heller
   * för att katalogen saknar den. Den har en smaktext, alltså en plats, och
   * den platsen är vad appen har att erbjuda. Farmers Market Organic finns i
   * hyllan för 89 kronor men har tomt druvfält, och att den då inte gick att
   * söka upp var svaret "vi vet inte vad det här är" på frågan "var ligger
   * den?". Utan grupp drar den inte i någon mittpunkt — den ligger bara där
   * den ligger.
   */
  const antalPerGrupp = new Map()
  for (const p of valda)
    for (const g of grupperna.get(p)) antalPerGrupp.set(g, (antalPerGrupp.get(g) ?? 0) + 1)
  const godkänd = (g) => (antalPerGrupp.get(g) ?? 0) >= dryck.minGrupp
  const grupperFör = (p) => grupperna.get(p).filter(godkänd)
  const utanGrupp = valda.filter((p) => !grupperFör(p).length).length

  /* --- termrymd ----------------------------------------------------------- */
  const df = new Map()
  const termerPer = valda.map((p) => {
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
      if (i !== undefined) rad[i] = Math.log(valda.length / df.get(t))
    }
    // L2-normalisera så att en dryck med sju inslag inte väger tyngre än en
    // med tre.
    const norm = Math.hypot(...rad) || 1
    for (let i = 0; i < rad.length; i++) rad[i] /= norm
    return rad
  })

  const Tm = kolumnMedel(T)
  const Tc = centrera(T, Tm)
  const textKomp = egenvektorer(kovarians(Tc), TEXT_KOMPONENTER)
  let TX = projicera(Tc, textKomp)

  /* Textkomponenterna skalas om innan de möter klockorna. Utan omskalning
   * bestämmer PC1 nästan allt; med full vitning får PC8 samma tyngd som PC1.
   * Båda ytterligheterna är fel; VIKTNING=egenvarde bygger den andra
   * varianten för jämförelse. Se PLAN.md för mätningen bakom valet.
   */
  const txRåSd = TX[0].map((_, i) => {
    const m = TX.reduce((s, r) => s + r[i], 0) / TX.length
    return Math.sqrt(TX.reduce((s, r) => s + (r[i] - m) ** 2, 0) / TX.length) || 1
  })
  const txSd =
    process.env.VIKTNING === 'egenvarde'
      ? (() => {
          const total = txRåSd.reduce((s, sd) => s + sd * sd, 0)
          const k = Math.sqrt(total / TEXT_KOMPONENTER)
          return txRåSd.map(() => k)
        })()
      : txRåSd
  TX = TX.map((r) => r.map((v, i) => v / txSd[i]))

  /* --- numeriska axlar ---------------------------------------------------- */
  const NUM = valda.map((p) => [
    ...dryck.klockor.map((k) => (k.värde(p) ?? 0) / k.max),
    Math.min(p.alcoholPercentage ?? 0, 15) / 15,
    ...dryck.extra.map((e) => e.värde(p)),
  ])
  const numMedel = kolumnMedel(NUM)
  const numSd = numMedel.map((m, i) => {
    const v = NUM.reduce((s, r) => s + (r[i] - m) ** 2, 0) / NUM.length
    return Math.sqrt(v) || 1
  })
  const antalKlockor = dryck.klockor.length + 1 // klockorna plus alkoholhalten
  const NUMz = NUM.map((r) => r.map((v, i) => (v - numMedel[i]) / numSd[i]))

  /* --- gemensam smakvektor ------------------------------------------------ */
  const V = TX.map((t, i) => [
    ...t,
    ...NUMz[i].map((v, j) => v * (j < antalKlockor ? VIKT_NUM : VIKT_EXTRA)),
  ])

  /* --- grupper ------------------------------------------------------------ */
  const perGrupp = new Map()
  valda.forEach((p, i) => {
    for (const g of grupperFör(p)) {
      if (!perGrupp.has(g)) perGrupp.set(g, [])
      perGrupp.get(g).push(i)
    }
  })

  const gruppNamn = [...perGrupp.keys()].sort((a, b) => a.localeCompare(b, 'sv'))
  const gruppMedel = gruppNamn.map((g) => {
    const idx = perGrupp.get(g)
    const m = new Float64Array(V[0].length)
    for (const i of idx) for (let j = 0; j < m.length; j++) m[j] += V[i][j]
    for (let j = 0; j < m.length; j++) m[j] /= idx.length
    return m
  })

  const sm = kolumnMedel(gruppMedel)
  const sc = centrera(gruppMedel, sm)
  /* Tre komponenter, inte två. De två första är kartan; den tredje används
     bara av 3D-läget, som finns för att man ska kunna se när två prickar
     ligger på varandra utan att smaka lika. PC3 skiljer fyra av fem sådana
     par åt — se PLAN.md. Att räkna fram den ändrar ingenting i de två
     första: potensiteration med deflation ger samma svar oavsett hur många
     komponenter man ber om. */
  const kartKomp = egenvektorer(kovarians(sc), 3)
  const koord = projicera(sc, kartKomp)
  const varians = kartKomp.map((k) => k.egenvärde)
  const variansSum = sc[0]
    .map((_, i) => {
      let s = 0
      for (const r of sc) s += r[i] * r[i]
      return s / (sc.length - 1)
    })
    .reduce((a, b) => a + b, 0)

  // Produkternas egna koordinater i samma bas, så att en enskild dryck kan
  // placeras på kartan bredvid sin grupp.
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
  const produkter = valda.map((p, i) => ({
    id: p.productId,
    namn: p.productNameBold,
    undertitel: p.productNameThin || null,
    bryggeri: p.producerName,
    land: p.country,
    grupper: grupperFör(p),
    förälder: dryck.förälderAv(p),
    abv: p.alcoholPercentage,
    pris: p.price,
    volym: p.volume,
    prisPerLiter: prisPerLiter(p),
    sortiment: p.assortmentText,
    klockor: Object.fromEntries(dryck.klockor.map((k) => [k.nyckel, k.värde(p) ?? 0])),
    ...(dryck.fatlagrad ? { fatlagrad: dryck.fatlagrad(p) } : {}),
    // Systembolagets egen matchning mot maträtter. Enda fältet i katalogen som
    // säger något om drycken som kartan inte redan vet — den bygger på
    // smaktexten, det här på vad någon på Systembolaget tycker att den passar
    // till. Ligger utanför kartan med flit: matchningen är grov och skulle dra
    // ihop grupper som inte smakar lika.
    mat: [...new Set(p.tasteSymbols ?? [])].sort(),
    // Bara om det finns en bild att hämta. Adressen går att räkna ut ur id:t.
    bild: (p.images?.length ?? 0) > 0,
    mörkhet: dryck.mörkhet(p),
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
    z: +prodKoord[i][2].toFixed(4),
  }))

  const grupper = gruppNamn.map((namn, i) => {
    const idx = perGrupp.get(namn)
    const ps = idx.map((j) => valda[j])
    const mörk = idx.map((j) => produkter[j].mörkhet).filter((v) => v !== null)
    // Vilka termer är typiska för just den här gruppen, jämfört med alla?
    const lokal = new Map()
    for (const j of idx) for (const t of termerPer[j]) lokal.set(t, (lokal.get(t) ?? 0) + 1)
    const kännetecken = [...lokal.entries()]
      .map(([t, n]) => [t, n / idx.length / (df.get(t) / valda.length)])
      .filter(([t]) => df.get(t) >= MIN_DF)
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t.slice(2))
    // Förälder är det vanligaste värdet i gruppen, inte det första. För öl är
    // det samma sak — alla i en stil delar kategori — men en druva odlas i
    // flera länder, och då är "Italien" på Nebbiolo ett påstående om vilket
    // som dominerar.
    const föräldrar = new Map()
    for (const p of ps) {
      const f = dryck.förälderAv(p)
      if (f) föräldrar.set(f, (föräldrar.get(f) ?? 0) + 1)
    }
    const förälder = [...föräldrar.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

    return {
      namn,
      förälder,
      antal: idx.length,
      liten: idx.length < dryck.litenUnder,
      x: +koord[i][0].toFixed(4),
      y: +koord[i][1].toFixed(4),
      z: +koord[i][2].toFixed(4),
      klockor: Object.fromEntries(
        dryck.klockor.map((k) => [k.nyckel, +median(ps.map((p) => k.värde(p) ?? 0)).toFixed(1)]),
      ),
      abv: +median(ps.map((p) => p.alcoholPercentage ?? 0)).toFixed(1),
      prisPerLiter: +median(ps.map(prisPerLiter).filter(Boolean)).toFixed(0),
      mörkhet: mörk.length ? +median(mörk).toFixed(2) : null,
      kännetecken: [...new Set(kännetecken)].slice(0, 6),
      vektor: [...gruppMedel[i]].map((v) => +v.toFixed(4)),
    }
  })

  /* Hur många produkter varje smakord förekommer hos. Likhetsmotorn använder
   * det för att välja vilka ord som är värda att nämna: "delar kaffe och
   * kavring" säger något om två öl, "delar frukt och kryddor" säger ingenting
   * — de orden finns hos halva sortimentet. Prefixet kapas här, så K:kaffe och
   * D:kaffe slås ihop till ett tal. */
  const ordfrekvens = {}
  for (const [term, n] of df) {
    const ord = term.slice(2)
    ordfrekvens[ord] = (ordfrekvens[ord] ?? 0) + n
  }
  const matfrekvens = {}
  for (const p of produkter) for (const m of p.mat) matfrekvens[m] = (matfrekvens[m] ?? 0) + 1

  /* --- hur mycket kartan visar -------------------------------------------
   * Kartaxlarna är två ortonormala egenvektorer, så avståndet mellan två
   * prickar ÄR den del av det fulla avståndet som ligger i kartans plan.
   * Kvoten säger alltså exakt hur stor andel av skillnaden man ser — och den
   * skiljer sig mycket mellan grupperna, som kartan är anpassad till, och de
   * enskilda produkterna, som bara projiceras in i samma plan. Talet står i
   * om-rutan, och räknas fram här så att texten inte kan bli inaktuell.
   */
  function synligAndel(lista) {
    const kvoter = []
    for (let i = 0; i < 3000; i++) {
      const a = lista[(i * 7919) % lista.length]
      const b = lista[(i * 104729 + 13) % lista.length]
      if (a === b) continue
      let s = 0
      for (let j = 0; j < a.vektor.length; j++) s += (a.vektor[j] - b.vektor[j]) ** 2
      const helt = Math.sqrt(s)
      if (helt > 1e-9) kvoter.push(Math.hypot(a.x - b.x, a.y - b.y) / helt)
    }
    return +median(kvoter).toFixed(3)
  }

  /* Produkterna sträcker sig utanför gruppernas område — en grupp är ett
   * medelvärde, och det som bildar det ligger runt omkring. Kartan behöver
   * veta hur långt för att kunna panorera dit. */
  const utbredning = {
    x0: Math.min(...produkter.map((p) => p.x)),
    x1: Math.max(...produkter.map((p) => p.x)),
    y0: Math.min(...produkter.map((p) => p.y)),
    y1: Math.max(...produkter.map((p) => p.y)),
  }

  const karta = {
    id: dryck.id,
    namn: dryck.namn,
    kort: dryck.kort,
    sida: dryck.sida,
    grupp: dryck.grupp,
    enhet: dryck.enhet,
    färgskala: dryck.färgskala,
    klockor: dryck.klockor.map(({ nyckel, etikett, max }) => ({ nyckel, etikett, max })),
    byggd: new Date().toISOString().slice(0, 10),
    antalProdukter: produkter.length,
    antalGrupper: grupper.length,
    /* Termerna som faktiskt spänner upp rymden, alltså de som klarat MIN_DF.
       Inte samma sak som antalet nycklar i `ordfrekvens`, där varenda ord i
       sortimentet finns med — även de som bara en produkt använder. */
    antalTermer: vokabulär.length,
    varians: varians.map((v) => +(v / variansSum).toFixed(3)),
    synligAndel: { grupp: synligAndel(grupper), produkt: synligAndel(produkter) },
    axlar: axlar.map((a, i) => ({ komponent: i + 1, ...a })),
    rattar: { MIN_DF, TEXT_KOMPONENTER, VIKT_NUM, VIKT_EXTRA },
    ordfrekvens,
    matfrekvens,
    utbredning,
    grupper,
  }

  /* --- kontroller ---------------------------------------------------------
   * Kartan ska stämma med hur drycken faktiskt smakar. Avstånden mäts i
   * enheter av kartans egen spridning så att de går att jämföra mellan
   * körningar även om rattarna ändras.
   */
  const pos = new Map(grupper.map((g) => [g.namn, [g.x, g.y]]))
  const spridning =
    [0, 1].reduce((s, d) => {
      const v = grupper.map((x) => (d ? x.y : x.x))
      const m = v.reduce((a, b) => a + b, 0) / v.length
      return s + Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length)
    }, 0) / 2
  const avstånd = (a, b) => {
    if (!pos.has(a) || !pos.has(b)) return null
    const [x1, y1] = pos.get(a)
    const [x2, y2] = pos.get(b)
    return Math.hypot(x1 - x2, y1 - y2) / spridning
  }
  const utfall = dryck.kontroller.map(([text, a, b, op, gräns]) => {
    const d = avstånd(a, b)
    const ok = d === null ? null : op === '>' ? d > gräns : d < gräns
    return { text, a, b, op, gräns, d, ok }
  })

  return { karta, produkter, kastat, dubbletter, utanGrupp, vokabulär, utfall, txRåSd }
}

/* --- kör alla drycker ----------------------------------------------------- */
mkdirSync(resolve(UT, 'public/data'), { recursive: true })
mkdirSync(resolve(UT, 'src/data'), { recursive: true })

const kartor = []
let allaGodkända = true

for (const dryck of DRYCKER) {
  if (BARA && dryck.id !== BARA) continue
  console.log(`\n${'='.repeat(62)}\n${dryck.namn.toUpperCase()}\n`)
  const { karta, produkter, kastat, dubbletter, utanGrupp, vokabulär, utfall, txRåSd } =
    byggKarta(dryck)

  // Grupperna byggs in och behövs direkt. Produkterna är megabyte och behövs
  // först vid ett klick, så de läggs i public/ och hämtas då. Kartan målas
  // utan att vänta på dem.
  writeFileSync(resolve(UT, `public/data/${dryck.id}.json`), JSON.stringify(produkter))
  kartor.push(karta)

  console.log('kastade produkter')
  for (const [skäl, n] of [...kastat.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${skäl.padEnd(24)}${r6(n)}`)
  console.log(`  ${'dubbletter ihopslagna'.padEnd(24)}${r6(dubbletter)}`)
  console.log(`
skrev
  ${dryck.id}.json${' '.repeat(Math.max(1, 18 - dryck.id.length))}${r6(produkter.length)} produkter, varav ${utanGrupp} utan ${dryck.grupp.en}
  ${karta.grupper.length} ${dryck.grupp.flera}, varav små (<${dryck.litenUnder}): ${karta.grupper.filter((g) => g.liten).length}
  termrymd: ${vokabulär.length} termer, färg satt på ${produkter.filter((p) => p.mörkhet !== null).length}, bild på ${produkter.filter((p) => p.bild).length}
  textkomponenter: ${txRåSd.map((sd, i) => `PC${i + 1} ${((sd / txRåSd[0]) ** 2 * 100).toFixed(0)}%`).join('  ')}

kartans varians    PC1 ${(karta.varians[0] * 100).toFixed(0)}%   PC2 ${(karta.varians[1] * 100).toFixed(0)}%   tillsammans ${((karta.varians[0] + karta.varians[1]) * 100).toFixed(0)}%
syns på kartan     ${(karta.synligAndel.grupp * 100).toFixed(0)}% av skillnaden mellan två ${dryck.grupp.flera}, ${(karta.synligAndel.produkt * 100).toFixed(0)}% mellan två ${dryck.enhet.flera}
  vänster  ${karta.axlar[0].negativ.join(', ')}
  höger    ${karta.axlar[0].positiv.join(', ')}
  ned      ${karta.axlar[1].negativ.join(', ')}
  upp      ${karta.axlar[1].positiv.join(', ')}`)

  const störst = [...karta.grupper].sort((a, b) => b.antal - a.antal)
  console.log(`\nstörsta ${dryck.grupp.flera}`)
  for (const g of störst.slice(0, 5)) console.log(`  ${r6(g.antal)}  ${g.namn}`)

  console.log('\nkontroller')
  for (const k of utfall) {
    if (k.ok === null) {
      console.log(`  ?  ${k.text}  (${k.a} eller ${k.b} saknas)`)
      allaGodkända = false
    } else {
      console.log(
        `  ${k.ok ? '✓' : '✗'}  ${k.text}  (${k.d.toFixed(2)}, ska vara ${k.op} ${k.gräns})`,
      )
      if (!k.ok) allaGodkända = false
    }
  }
}

writeFileSync(resolve(UT, 'src/data/kartor.json'), JSON.stringify(kartor, null, 1))
console.log(
  `\n${'='.repeat(62)}\n${allaGodkända ? 'klart. alla kartor klarar sina kontroller.' : 'KLART, MEN NÅGON KONTROLL GICK INTE IGENOM — se ovan.'}`,
)
