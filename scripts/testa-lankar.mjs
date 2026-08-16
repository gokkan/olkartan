/**
 * Test av permalänk, smakordssökning och matvyn.
 *
 *   npm run dev            i en terminal
 *   npm run test:lankar
 *
 * Skicka en annan adress som argument för att testa ett produktionsbygge.
 */
import { chromium } from 'playwright'

const bas = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '') + '/'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const fel = []
p.on('console', (m) => m.type() === 'error' && fel.push(m.text()))
p.on('pageerror', (e) => fel.push(String(e)))

/* Produkterna hämtas separat efter att kartan målats. Sökrutans platshållare
   byter lydelse när de landat — enda signalen i gränssnittet. */
const klar = async () => {
  await p.waitForSelector('svg circle')
  await p.waitForFunction(() =>
    document.querySelector('.sok input')?.placeholder.includes('producent'),
  )
}

/* --- 1. Permalänk: en adress ska återskapa urvalet vid inladdning --------- */
console.log('permalänk:')
await p.goto(bas + '#grupp=' + encodeURIComponent('Torr porter och stout'), {
  waitUntil: 'networkidle',
})
await klar()
await p.waitForSelector('.panel h2')
console.log('  #grupp= → ' + (await p.locator('.panel h2').textContent()))

await p.goto(bas + '#produkt=507849', { waitUntil: 'networkidle' })
await klar()
await p.waitForSelector('.panel h2')
console.log('  #öl= → ' + (await p.locator('.panel h2').textContent()))

/* --- 2. Urvalet ska hamna i adressfältet när man klickar ----------------- */
await p.goto(bas, { waitUntil: 'networkidle' })
await klar()
await p.locator('circle[data-grupp="Hefeweizen"]').click()
await p.waitForTimeout(300)
console.log('  klick skriver hash: ' + decodeURIComponent(new URL(p.url()).hash))

/* --- 3. Bakåtknappen ---------------------------------------------------- */
await p.locator('circle[data-grupp="Witbier"]').click()
await p.waitForTimeout(300)
await p.goBack()
await p.waitForTimeout(400)
const tillbaka = await p.locator('.panel h2').textContent()
console.log(`  bakåt → ${tillbaka}  ${tillbaka === 'Hefeweizen' ? '✓' : '✗'}`)

/* --- 4. Smakordssökning -------------------------------------------------- */
console.log('\nsmakord:')
await p.goto(bas, { waitUntil: 'networkidle' })
await klar()
await p.locator('.sok input').fill('kavring')
await p.waitForTimeout(300)
const typer = await p.locator('.sok-stil').allTextContents()
console.log('  träfftyper: ' + [...new Set(typer)].join(', '))
const ordrad = p.locator('.sok-traffar li', { hasText: 'smakord' }).first()
await ordrad.locator('button').click()
await p.waitForSelector('.panel h2')
console.log('  vald: ' + (await p.locator('.panel h2').textContent()))
console.log('  ' + (await p.locator('.panel .undertitel').textContent()))
console.log('  vanligast i: ' + (await p.locator('.termer li').first().textContent()))
console.log('  prickar på kartan: ' + (await p.locator('circle[data-produkt]').count()))
await p.screenshot({ path: 'smakord.png' })

/* --- 5. Matvyn ----------------------------------------------------------- */
console.log('\nmat:')
await p.goto(bas, { waitUntil: 'networkidle' })
await klar()
await p.locator('.sok input').fill('fisk')
await p.waitForTimeout(300)
const matrad = p.locator('.sok-traffar li', { hasText: 'mat' }).first()
await matrad.locator('button').click()
await p.waitForSelector('.panel h2')
console.log('  vald: ' + (await p.locator('.panel h2').textContent()))
console.log('  ' + (await p.locator('.panel .undertitel').textContent()))
console.log('  moln på kartan: ' + (await p.locator('circle[data-produkt]').count()))
console.log(`  hamnar i hashen: ${decodeURIComponent(p.url()).includes('mat=Fisk') ? '✓' : '✗'}`)

/* Listan ska gå att klicka sig in i, och urvalet ligga kvar runt omkring. */
const förstaÖlet = await p.locator('.produkter button .p-namn').first().textContent()
await p.locator('.produkter button').first().click()
await p.waitForTimeout(400)
console.log(`  klick på "${förstaÖlet.trim()}" → ${await p.locator('.panel h2').textContent()}`)
console.log(`  tillbakalänk: ${await p.locator('.tillbaka').textContent()}`)
console.log(
  `  urvalet kvar i hashen: ${decodeURIComponent(p.url()).includes('mat=Fisk') ? '✓' : '✗'}`,
)
console.log(`  molnet kvar på kartan: ${await p.locator('circle[data-produkt]').count()}`)
await p.locator('.tillbaka').click()
await p.waitForTimeout(400)
console.log(`  tillbaka → ${await p.locator('.panel h2').textContent()}`)

/* Och tillbaka in i en produkt, där matchipsen ska gå att klicka på. */
await p.goto(bas + '#produkt=507849', { waitUntil: 'networkidle' })
await klar()
await p.waitForSelector('.panel h2')
const chips = p.locator('.term-knapp')
console.log(`  matchips i produktvyn: ${await chips.count()}`)
if (await chips.count()) {
  await chips.first().click()
  await p.waitForTimeout(300)
  console.log('  klick på chips → ' + (await p.locator('.panel h2').textContent()))
}

/* --- 6. Etikettbilden får aldrig lämna ett hål --------------------------- */
console.log('\nbilder:')
const bildanrop = []
p.on('response', (r) => r.url().includes('productimages') && bildanrop.push(r.status()))

await p.goto(bas + '#produkt=507849', { waitUntil: 'networkidle' })
await klar()
await p.waitForSelector('.panel h2')
await p.waitForTimeout(900)
const laddad = await p
  .locator('.etikettbild')
  .evaluate((e) => e.complete && e.naturalWidth > 0)
  .catch(() => false)
console.log(`  Guinness: bilden syns ${laddad ? '✓' : '✗'}`)

/* Ett öl som saknar bild i katalogen ska inte ens fråga efter en. */
bildanrop.length = 0
await p.goto(bas + '#produkt=62855970', { waitUntil: 'networkidle' })
await klar()
await p.waitForSelector('.panel h2')
await p.waitForTimeout(700)
console.log(
  `  öl utan bild: ${await p.locator('.etikettbild').count()} img-element, ` +
    `${bildanrop.length} anrop  ${bildanrop.length === 0 ? '✓' : '✗ frågar i onödan'}`,
)

/* Och om Systembolaget flyttar sökvägen ska panelen se ut som förut. */
await p.route('**/productimages/**', (r) => r.fulfill({ status: 404, body: '' }))
await p.goto(bas + '#produkt=507849', { waitUntil: 'networkidle' })
await klar()
await p.waitForSelector('.panel h2')
await p.waitForTimeout(1000)
const kvar = await p.locator('.etikettbild').count()
console.log(
  `  bruten länk: ${kvar} img-element kvar, rubriken syns ` +
    `${await p.locator('.panel h2').isVisible()}  ${kvar === 0 ? '✓ inget hål' : '✗'}`,
)
await p.unroute('**/productimages/**')
// Den brutna bilden loggar ett 404 i konsolen. Det är webbläsaren som säger
// det, inte appen, och det är inte något att larma om längre ned.
fel.length = 0

/* --- 7. Byte av karta ------------------------------------------------------ */
console.log('\nkartbyte:')
await p.goto(bas, { waitUntil: 'networkidle' })
await klar()
for (const kort of ['rött', 'vitt', 'öl']) {
  await p.locator('.kartval button', { hasText: kort }).click()
  await p.waitForTimeout(700)
  await p.waitForFunction(() =>
    document.querySelector('.sok input')?.placeholder.includes('producent'),
  )
  const prickar = await p.locator('circle[data-grupp]').count()
  const fot = (await p.locator('footer').textContent()).replace(/\s+/g, ' ').trim()
  console.log(`  ${kort.padEnd(5)} ${String(prickar).padStart(3)} prickar · ${fot.slice(0, 46)}`)
}

/* Ett vin med flera druvor ska gå att nå från var och en av dem. */
await p.locator('.kartval button', { hasText: 'rött' }).click()
await p.waitForTimeout(700)
await p.locator('.sok input').fill('cabernet sauvignon')
await p.waitForTimeout(350)
await p.locator('.sok-traffar li button').first().click()
await p.waitForSelector('.panel h2')
console.log(
  `  druvvy: ${await p.locator('.panel h2').textContent()} — ${await p.locator('.panel .undertitel').textContent()}`,
)
await p.locator('.produkter button').first().click()
await p.waitForTimeout(400)
const druvor = await p.locator('.termer .term-knapp').allTextContents()
console.log(`  vinet: ${await p.locator('.panel h2').textContent()}`)
console.log(`  klickbara chips: ${druvor.slice(0, 6).join(', ')}`)

/* --- 8. Produkter utan grupp ---------------------------------------------
 * Var sjätte vin har tomt druvfält hos Systembolaget — Farmers Market Organic
 * står i hyllan för 89 kronor men gick inte att söka upp, för kartan kastade
 * allt som saknade druva. De ligger kvar nu, utan att höra till någon prick.
 * Produkten plockas ur datan så att testet följer med när sortimentet ändras. */
console.log('\nutan grupp:')
for (const [karta, hash] of [
  ['rott', '#karta=rott'],
  ['ol', ''],
]) {
  await p.goto(bas + hash, { waitUntil: 'networkidle' })
  await klar()
  const ö = await p.evaluate(
    async (u) => {
      const alla = await (await fetch(u)).json()
      const utan = alla.filter((x) => x.grupper.length === 0)
      const f = utan.find((x) => x.namn === 'Farmers Market') ?? utan[0]
      return {
        antal: utan.length,
        id: f?.id,
        namn: [f?.namn, f?.undertitel].filter(Boolean).join(' '),
      }
    },
    bas + `data/${karta}.json`,
  )

  await p.goto(bas + `#${hash ? 'karta=' + karta + '&' : ''}produkt=${ö.id}`, {
    waitUntil: 'networkidle',
  })
  await klar()
  await p.waitForSelector('.panel h2')
  await p.waitForTimeout(1200)
  const rubrik = await p.locator('.panel h2').textContent()
  // Ingen tillbakalänk (det finns ingen grupp att gå till), ingen markör i
  // staplarna (ingen median att jämföra med), men en prick på kartan och en
  // not som säger varför.
  const not = await p.locator('.panel .källnot').count()
  const bak = await p.locator('.tillbaka').count()
  const markör = await p.locator('.stapel-markör').count()
  const prickar = await p.locator('circle[data-produkt]').count()
  const ok = rubrik === ö.namn && not === 1 && bak === 0 && markör === 0 && prickar === 1
  console.log(
    `  ${karta.padEnd(5)} ${String(ö.antal).padStart(4)} st · "${ö.namn}" → "${rubrik}", ` +
      `not ${not}, tillbaka ${bak}, markör ${markör}, prickar ${prickar}  ${ok ? '✓' : '✗'}`,
  )
}

/* --- 9. Om-rutan -----------------------------------------------------------
 * Talen i texten hämtas ur kartans metadata, inte ur texten själv. Testet
 * kollar att de faktiskt landar — en tom lucka mitt i en mening är svår att
 * få syn på, och sortimentet byter varje vecka. */
console.log('\nom-rutan:')
await p.goto(bas, { waitUntil: 'networkidle' })
await klar()
await p.locator('.om-knapp').click()
await p.waitForSelector('.panel h2')
await p.waitForTimeout(400)
const omText = (await p.locator('.panel').textContent()).replace(/\s+/g, ' ')
console.log(
  `  öppnar: "${await p.locator('.panel h2').textContent()}", hash ${new URL(p.url()).hash}`,
)
/* kartor.json buntas in i bygget och går inte att hämta, så talen kollas där
   de ska stå: i meningarna. En tom lucka mitt i en mening är lätt att missa
   med ögat, och uppstår så fort ett fält byter namn i byggskriptet. */
const utfall = [
  ['termer', /De (\d+) ord som är vanliga/],
  ['grupper', /de (\d+) mittpunkterna/],
  ['vikt', /vägda till ([\d,]+) mot textens/],
  ['grupp%', /syns (\d+ %) på kartan/],
  ['produkt%', /syns bara (\d+ %)/],
  ['byggd', /byggdes senast (\d{4}-\d{2}-\d{2})/],
  ['antal', /innehåller ([\d\s]+?) öl i (\d+) stilar/],
].map(([namn, re]) => {
  const m = omText.match(re)
  return `${namn} ${m ? m.slice(1).join('/').trim() : '✗SAKNAS'}`
})
console.log(`  ${utfall.join(' · ')}  ${utfall.some((u) => u.includes('SAKNAS')) ? '✗' : '✓'}`)
console.log(`  axelrader: ${await p.locator('.axelfakta li').count()} st`)

/* Byte av karta ska hålla rutan öppen och byta innehåll. */
await p.locator('.kartval button', { hasText: 'rött' }).click()
await p.waitForTimeout(700)
console.log(
  `  efter kartbyte: "${await p.locator('.panel .meta').first().textContent()}" ` +
    `${(await p.locator('.panel h2').count()) === 1 ? '✓ kvar' : '✗ stängdes'}`,
)

/* Och det man tittade på ska komma tillbaka när rutan stängs. */
await p.goto(bas + '#grupp=' + encodeURIComponent('Hefeweizen'), { waitUntil: 'networkidle' })
await klar()
await p.waitForSelector('.panel h2')
await p.locator('.om-knapp').click()
await p.waitForTimeout(400)
const övertog = await p.locator('.panel h2').textContent()
await p.locator('.stäng').click()
await p.waitForTimeout(400)
const åter = await p.locator('.panel h2').textContent()
console.log(
  `  ovanpå en stil: "${övertog}" → stäng → "${åter}"  ${åter === 'Hefeweizen' ? '✓' : '✗'}`,
)

/* --- 10. Färg efter smakklocka ---------------------------------------------
 * Platsen betyder smaklikhet och storleken antal, så färgen är den enda lediga
 * kanalen för klockorna. Testet kollar att den faktiskt skiljer: IPA ska bli
 * varmare än pilsner när kartan färgas efter beska. */
console.log('\nfärg efter klocka:')
await p.goto(bas, { waitUntil: 'networkidle' })
await klar()
const kulör = () =>
  p.evaluate(() => {
    const av = (n) =>
      document.querySelector(`circle[data-grupp="${n}"]`)?.getAttribute('fill') ?? ''
    const värme = (s) => {
      const [r, , b] = s.match(/\d+/g)?.map(Number) ?? [0, 0, 0]
      return r - b
    }
    return {
      olika: new Set(
        [...document.querySelectorAll('circle[data-grupp]')].map((e) => e.getAttribute('fill')),
      ).size,
      ipa: värme(av('India pale ale (IPA)')),
      pilsner: värme(av('Pilsner - tysk stil')),
      gueuze: värme(av('Gueuze')),
    }
  })
console.log(`  standard: ${(await kulör()).olika} olika färger`)
await p.locator('.fargval select').selectOption('beska')
await p.waitForTimeout(400)
const k = await kulör()
console.log(
  `  beska: ${k.olika} olika · IPA ${k.ipa} > pilsner ${k.pilsner} > gueuze ${k.gueuze}  ` +
    (k.ipa > k.pilsner && k.pilsner > k.gueuze ? '✓ följer beskan' : '✗'),
)
console.log(
  `  hash: ${new URL(p.url()).hash} · skala ${await p.locator('.fargskala').textContent()}`,
)

/* Pris och alkoholhalt ligger utanför smakprofilen. Imperial stout ska vara
   både dyrare och starkare än en internationell lager — går den kontrollen
   sönder är det värdet som inte når fram till färgen. */
for (const [val, tyngre] of [
  ['pris', 'dyrare'],
  ['abv', 'starkare'],
]) {
  await p.locator('.fargval select').selectOption(val)
  await p.waitForTimeout(400)
  const v = await p.evaluate(() => {
    const värme = (n) => {
      const s = document.querySelector(`circle[data-grupp="${n}"]`)?.getAttribute('fill') ?? ''
      const [r, , b] = s.match(/\d+/g)?.map(Number) ?? [0, 0, 0]
      return r - b
    }
    return { stout: värme('Imperial porter och stout'), lager: värme('Internationell stil') }
  })
  console.log(
    `  ${val}: skala ${await p.locator('.fargskala').textContent()} · ` +
      `imperial stout ${v.stout} > internationell lager ${v.lager}  ` +
      (v.stout > v.lager ? `✓ ${tyngre} varmare` : '✗'),
  )
}

/* Färgvalet är en inställning för hur man tittar, inte en del av det man
   tittar på, och får inte nollställas av ett klick. Det gjorde det: bas() bar
   med sig karta och vyläge men inte färgen, så varje prick man valde slog
   tillbaka till ölfärg. */
await p.locator('.fargval select').selectOption('beska')
await p.waitForTimeout(300)
const vald = () => p.locator('.fargval select').inputValue()
await p.locator('circle[data-grupp="Hefeweizen"]').click()
await p.waitForTimeout(400)
const efterStil = await vald()
await p.locator('.produkter button').first().click()
await p.waitForTimeout(500)
const efterProdukt = await vald()
await p.locator('.stäng').click()
await p.waitForTimeout(400)
const efterStäng = await vald()
console.log(
  `  överlever klick: stil "${efterStil}", produkt "${efterProdukt}", stäng "${efterStäng}"  ` +
    ([efterStil, efterProdukt, efterStäng].every((v) => v === 'beska') ? '✓' : '✗ nollställs'),
)

/* Beska finns inte på vitvinskartan — valet ska falla tillbaka, inte krascha. */
await p.locator('.kartval button', { hasText: 'vitt' }).click()
await p.waitForTimeout(700)
console.log(
  `  efter byte till vitt: valt "${await p.locator('.fargval select').inputValue()}", ` +
    `alternativ ${(await p.locator('.fargval option').allTextContents()).slice(1).join('/')}  ` +
    ((await p.locator('.fargval select').inputValue()) === '' ? '✓ föll tillbaka' : '✗'),
)

/* --- 11. Det som sticker ut -----------------------------------------------
 * Listan i gruppvyn läses från båda hållen, och produktvyn säger till när en
 * dryck avviker. Noterna ska bara synas när de gäller — ett kort utan noter
 * är den vanliga sortens dryck, och det är det vanligaste fallet. */
console.log('\nudda:')
await p.goto(bas + '#grupp=' + encodeURIComponent('Berliner weisse'), { waitUntil: 'networkidle' })
await klar()
await p.waitForSelector('.produkter button')
const först = () => p.locator('.produkter .p-namn').first().textContent()
const typiskast = await först()
await p.locator('.vippa').click()
await p.waitForTimeout(400)
const uddast = await först()
console.log(`  typiskast "${typiskast.trim()}" → vippa → uddast "${uddast.trim()}"`)
console.log(
  `  rubriken följer med: "${(await p.locator('.med-vippa').textContent()).replace(/\s+/g, ' ')}"  ` +
    (typiskast !== uddast ? '✓ vänder listan' : '✗'),
)

for (const [fråga, väntat] of [
  ['Ringu Brewing Julbock', 'smakar mer som'],
  ['Elektra Sauer Kveik', 'ensam'],
  ['Guinness Draught', null],
]) {
  await p.goto(bas, { waitUntil: 'networkidle' })
  await klar()
  await p.locator('.sok input').fill(fråga)
  await p.waitForTimeout(450)
  await p.locator('.sok-traffar li button').last().click()
  await p.waitForSelector('.panel h2')
  await p.waitForTimeout(900)
  const antal = await p.locator('.avvikelser').count()
  const text = antal ? (await p.locator('.avvikelser').textContent()).replace(/\s+/g, ' ') : ''
  const ok = väntat === null ? antal === 0 : text.includes(väntat)
  console.log(
    `  ${(await p.locator('.panel h2').textContent()).slice(0, 32).padEnd(33)}${text || 'inga noter'}  ${ok ? '✓' : '✗'}`,
  )
}

/* --- 12. Serveringsmeningen -----------------------------------------------
 * Systembolagets egen mening, ordagrant. Den ska stå under "Passar till"
 * tillsammans med symbolerna, och den ska bära temperaturen — det är det enda
 * symbolerna inte kan säga. Blanktecknen ska vara städade: katalogen släpar
 * med radbrytningar och dubbla mellanslag. */
console.log('\nservering:')
for (const [adress, väntat] of [
  ['#produkt=507849', 'mening'], // Guinness — ölkartan
  ['#karta=rott&produkt=64055869', 'mening'], // Poggio al Leone — tillagningssätt
  ['#produkt=803689', 'utan'], // Julskägg — ett av två öl utan usage-text
]) {
  await p.goto(bas + adress, { waitUntil: 'networkidle' })
  await klar()
  await p.waitForSelector('.panel h2')
  const rubrik = p.locator('.panel h3', { hasText: 'Passar till' })
  const mening = (await rubrik.locator('+ .smaktext').count())
    ? (await rubrik.locator('+ .smaktext').textContent()).trim()
    : null
  const namn = (await p.locator('.panel h2').textContent()).slice(0, 22).padEnd(23)
  const chips = await p.locator('.termer .term-knapp').count()
  if (väntat === 'utan') {
    /* Utan mening ska rubriken ändå stå kvar, för symbolerna finns. */
    console.log(`  ${namn}ingen mening, ${chips} symboler  ` + (!mening && chips > 0 ? '✓' : '✗'))
    continue
  }
  console.log(`  ${namn}${mening ?? 'SAKNAS'}`)
  console.log(
    `  ${''.padEnd(23)}` +
      (mening === null
        ? '✗ ingen mening'
        : `${/\d+\s*°C/.test(mening) ? '✓ temperatur' : '✗ ingen temperatur'}, ` +
          `${/\s{2,}/.test(mening) ? '✗ ostädade blanktecken' : '✓ städad'}, ` +
          `${chips > 0 ? '✓ symbolerna kvar' : '✗ symbolerna borta'}`),
  )
}

/* --- 13. Rama in molnet -------------------------------------------------- */
await p.goto(bas, { waitUntil: 'networkidle' })
await klar()
await p.goto(bas + '#grupp=' + encodeURIComponent('India pale ale (IPA)'), {
  waitUntil: 'networkidle',
})
await klar()
await p.waitForSelector('.visa-molnet')
const skala = async () =>
  parseFloat((await p.locator('svg > g').getAttribute('transform')).match(/scale\(([\d.]+)\)/)[1])
const före = await skala()
await p.locator('.visa-molnet').click()
await p.waitForTimeout(900)
const efterRam = await skala()
console.log(`\nrama in molnet: skala ${före.toFixed(2)} → ${efterRam.toFixed(2)}`)

console.log(fel.length ? '\nKONSOLFEL:\n' + fel.join('\n') : '\ninga konsolfel')
await b.close()
