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

/* --- 14. Landfiltret ------------------------------------------------------
 * Filtret är ett raster och inte ett val: det ska smalna av kartan utan att
 * kasta bort det man tittar på, och överleva ett klick. Tre saker prövas —
 * att räkningen i listan stämmer med kartan, att filtret följer med genom ett
 * gruppval, och att ett land som saknas på den nya kartan går att klicka bort
 * i stället för att låsa in en i en tom karta. */
await p.goto(bas, { waitUntil: 'networkidle' })
await klar()
await p.locator('.landval > button').click()
await p.waitForSelector('.landval-lista')
const toppland = await p.locator('.landval-lista button').nth(1).textContent()
await p.locator('.landval-lista button', { hasText: /^Sverige/ }).click()
await p.waitForTimeout(700)
const svenska = await p.locator('.olprick').count()
const foten = await p.locator('footer span').nth(1).textContent()
console.log(`\nlandfiltret`)
console.log(`  listans topp    ${toppland}`)
console.log(`  prickar på kartan ${svenska} · foten "${foten.trim()}"`)
/* Talet i foten sätts med toLocaleString('sv-SE'), som skiljer tusental med
   hårt blanksteg. Alla blanktecken plockas därför bort ur båda sidorna innan
   de jämförs — annars mäter man teckenkodning i stället för räkning. */
const utanMellanrum = (s) => s.replace(/\s/gu, '')
console.log(
  `  ${utanMellanrum(foten).includes(utanMellanrum(svenska.toLocaleString('sv-SE'))) ? '✓' : '✗'} foten räknar samma som kartan ritar`,
)

await p.keyboard.press('Escape')
await p.locator('circle[data-grupp="Torr porter och stout"]').click()
await p.waitForTimeout(700)
const hashEfter = await p.evaluate(() => location.hash)
const not = await p.locator('.panel .källnot').first().textContent()
console.log(`  ${hashEfter.includes('land=Sverige') ? '✓' : '✗'} filtret överlever ett gruppval`)
console.log(`  ${/Bara Sverige visas/.test(not) ? '✓' : '✗'} panelen säger att den är avsmalnad`)

/* Eritrea finns bland ölen och inte bland vinerna. Byter man karta blir den
   tom — och då är listan enda vägen ut. Står landet inte kvar där sitter man
   fast med ett filter man inte kan se. */
await p.goto(bas + '#karta=rott&land=Eritrea', { waitUntil: 'networkidle' })
await klar()
await p.locator('.landval > button').click()
await p.waitForSelector('.landval-lista')
const kvarstår = await p.locator('.landval-lista button.aktiv').textContent()
console.log(
  `  ${/Eritrea/.test(kvarstår) ? '✓' : '✗'} bortvalt land går att klicka bort: "${kvarstår.trim()}"`,
)

/* --- 15. Axelkorset i 3D --------------------------------------------------
 * Sex armar ut från en mittpunkt, och sex namn som alla är olika. Att inget
 * ord namnger två riktningar prövas också i enhetstestet mot kartor.json —
 * här prövas att de faktiskt ritas ut, alla sex, efter att molnet vridit sig
 * ur startläget där djupaxeln pekar rakt mot en. */
await p.goto(bas + '#vy=3d', { waitUntil: 'networkidle' })
await klar()
const armar = await p.locator('.axelkors line').count()
const mitt = await p.locator('.mittpunkt').count()
await p.waitForTimeout(4000)
const spetsar = await p.locator('.axelnamn text').allTextContents()
console.log(`\naxelkorset i 3D`)
console.log(`  ${armar === 6 ? '✓' : '✗'} sex armar · ${mitt === 1 ? '✓' : '✗'} en mittpunkt`)
console.log(`  ${spetsar.length === 6 ? '✓' : '✗'} sex namngivna spetsar efter vridning`)
console.log(
  `  ${new Set(spetsar.flatMap((s) => s.split(', '))).size === spetsar.flatMap((s) => s.split(', ')).length ? '✓' : '✗'} inget ord på två spetsar`,
)
for (const s of spetsar) console.log(`    ${s}`)

/* --- 16. Markering från listan -------------------------------------------
 * Pekaren över en rad i panelen ska peka ut drycken på kartan, med ett streck
 * till den man tittar på. Det intressanta fallet är "Liknande", där grannen
 * ofta hör hemma i en annan grupp och alltså inte ligger i molnet — den måste
 * ritas ändå. Markeringen ska också släckas: både när pekaren lämnar listan
 * och när ett klick byter det panelen visar. */
await p.goto(bas + '#produkt=507849', { waitUntil: 'networkidle' })
await klar()
await p.waitForSelector('.liknande button')
const grannenNamn = (await p.locator('.liknande .l-namn').nth(2).textContent()).trim()
const grannenStil = (await p.locator('.liknande .l-stil').nth(2).textContent()).trim()
await p.locator('.liknande button').nth(2).hover()
await p.waitForTimeout(350)
const utpekat = await p.locator('.marke text').textContent()
console.log(`\nmarkering från listan`)
console.log(`  hovrar "${grannenNamn}" · ${grannenStil}`)
console.log(`  ${utpekat === grannenNamn ? '✓' : '✗'} kartan pekar ut samma dryck`)
console.log(
  `  ${(await p.locator('.marke line').count()) === 1 ? '✓' : '✗'} ett streck till den man tittar på`,
)
await p.mouse.move(500, 400)
await p.waitForTimeout(300)
console.log(
  `  ${(await p.locator('.marke').count()) === 0 ? '✓' : '✗'} släcks när pekaren lämnar listan`,
)

await p.goto(bas + '#grupp=' + encodeURIComponent('Torr porter och stout'), {
  waitUntil: 'networkidle',
})
await klar()
await p.locator('.produkter button').nth(3).hover()
await p.waitForTimeout(300)
const fannsFöre = await p.locator('.marke').count()
await p.locator('.produkter button').nth(3).click()
await p.waitForTimeout(500)
console.log(
  `  ${fannsFöre === 1 && (await p.locator('.marke').count()) === 0 ? '✓' : '✗'} släcks av ett klick`,
)

/* --- 17. Rutnätet och stolparna i 3D --------------------------------------
 * Axelkorset säger vilket håll man vridit, men inte hur långt bort något
 * ligger. Rutnätet i mittplanet ger perspektivet något att verka på, och
 * lodlinjerna från landmärkena är det som faktiskt placerar en prick i
 * djupled — man läser av foten i rutnätet i stället för pricken. */
await p.goto(bas + '#vy=3d', { waitUntil: 'networkidle' })
await klar()
await p.waitForTimeout(4000)
const rutor = await p.locator('.rutnat line').count()
const stolpar = await p.locator('.stolpar line').count()
const fötter = await p.locator('.stolpar circle').count()
console.log(`\norientering i 3D`)
console.log(`  ${rutor === 18 ? '✓' : '✗'} rutnätet: ${rutor} linjer (9 + 9)`)
console.log(`  ${stolpar === 14 && fötter === 14 ? '✓' : '✗'} ${stolpar} stolpar med ${fötter} fötter`)
console.log(
  `  ${(await p.locator('.axelkors line').count()) === 6 ? '✓' : '✗'} korset kvar med sina sex armar`,
)

/* --- 18. Valda axlar i 3D --------------------------------------------------
 * Axlarna går att sätta till vad kartan kan mäta, inte bara till
 * huvudkomponenterna. Tre saker prövas: att adressen bär valet in, att korset
 * namnger de valda riktningarna i stället för smakrymdens ord, och att foten
 * slutar lova smaklikhet — avståndet mellan två prickar betyder ingenting när
 * axlarna är beska, fyllighet och sötma.
 *
 * Att en dimension bara får ligga på en axel prövas i menyn: väljer man beska
 * på x ska den vara spärrad på y och z. Utan det går molnet att ställa till en
 * linje. */
await p.goto(bas + '#vy=3d&axlar=' + encodeURIComponent('beska,fyllighet,sötma'), {
  waitUntil: 'networkidle',
})
await klar()
await p.waitForTimeout(4000)
const valda = await p.locator('.axelval select').evaluateAll((s) => s.map((e) => e.value))
const valdaSpetsar = await p.locator('.axelnamn text').allTextContents()
const valdFot = (await p.locator('footer span').last().textContent()).trim()
const valdNot = (await p.locator('.grepp-not').textContent()).trim()
console.log(`\nvalda axlar i 3D`)
console.log(
  `  ${valda.join(',') === 'beska,fyllighet,sötma' ? '✓' : '✗'} adressen bär valet: ${valda.join(', ')}`,
)
console.log(
  `  ${(await p.locator('.axelkors line').count()) === 6 ? '✓' : '✗'} korset kvar med sina sex armar`,
)
console.log(
  `  ${valdaSpetsar.length === 6 && valdaSpetsar.every((s) => /beska|fyllighet|sötma/.test(s)) ? '✓' : '✗'} spetsarna namnger klockorna: ${valdaSpetsar.join(' · ')}`,
)
console.log(`  ${/inte smaklikhet/.test(valdFot) ? '✓' : '✗'} foten lovar inte smaklikhet längre`)
console.log(`  ${/heltal/.test(valdNot) ? '✓' : '✗'} noten säger att klockorna är ett galler`)

/* Standardläget måste vara oberört. Det är hela villkoret för att valet fick
   byggas: den som inte rör menyerna ska se exakt den karta som fanns förut. */
await p.goto(bas + '#vy=3d', { waitUntil: 'networkidle' })
await klar()
await p.locator('.axelval select').first().selectOption('beska')
await p.waitForTimeout(300)
const spärrade = await p.locator('.axelval select').evaluateAll((sel) =>
  sel.map((s) => [...s.options].filter((o) => o.disabled).map((o) => o.value)),
)
console.log(
  `  ${spärrade[1].includes('beska') && spärrade[2].includes('beska') ? '✓' : '✗'} beska spärrad på de andra två axlarna`,
)
console.log(
  `  ${/axlar=beska/.test(decodeURIComponent(await p.evaluate(() => location.hash))) ? '✓' : '✗'} menyn skriver valet till adressen`,
)

/* Beska finns inte för vin. Hela trippeln faller tillbaka, inte en av tre —
   två kvar och en utbytt vore en bild man inte bett om. */
await p.goto(bas + '#vy=3d&axlar=' + encodeURIComponent('beska,pc2,fyllighet'), {
  waitUntil: 'networkidle',
})
await klar()
await p.locator('.kartval button').nth(1).click()
await p.waitForTimeout(500)
const efterByte = decodeURIComponent(await p.evaluate(() => location.hash))
console.log(`  ${!/axlar=/.test(efterByte) ? '✓' : '✗'} valet faller bort vid kartbyte: ${efterByte}`)

/* --- 19. Hovring i 3D ------------------------------------------------------
 * Molnet gick länge inte att peka på. Nu säger en ruta vilken dryck man håller
 * pekaren över — och det som är värt att pröva är inte att rutan dyker upp,
 * utan de tre saker runt omkring som är lätta att få fel:
 *
 *   att molnet slutar snurra i samma stund (ett mål som glider undan går inte
 *   att läsa), att ett drag inte samtidigt öppnar en ruta, och att rutan
 *   släcks när pekaren lämnar kartan i stället för att lysa kvar i kanten. */
const mittPå = async (väljare, i = 0) => {
  const r = await p.locator(väljare).nth(i).boundingBox()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}
const rutan = async () =>
  (await p.locator('.knappnål').count())
    ? {
        rubrik: (await p.locator('.knappnål strong').textContent()).trim(),
        under: (await p.locator('.knappnål span').textContent()).trim(),
      }
    : null

await p.goto(bas + '#grupp=Hefeweizen&vy=3d', { waitUntil: 'networkidle' })
await klar()
await p.waitForSelector('.karta3d circle[data-produkt]')
await p.waitForTimeout(4000)
console.log(`\nhovring i 3D`)

/* En molnprick som ingen gruppprick ligger framför. Tar man bara den första
   bästa svarar ofta gruppen i stället — den är i vägen och ska vara det — och
   då prövar testet inte den väg det tror sig pröva. */
const fri = await p.evaluate(() => {
  const av = (s) =>
    [...document.querySelectorAll(s)].map((e) => ({
      id: e.getAttribute('data-produkt'),
      x: +e.getAttribute('cx'),
      y: +e.getAttribute('cy'),
      r: +e.getAttribute('r'),
    }))
  const grupper = av('.karta3d circle[data-grupp]')
  return (
    av('.karta3d circle[data-produkt]').find((q) =>
      grupper.every((g) => Math.hypot(g.x - q.x, g.y - q.y) > g.r + q.r + 4),
    )?.id ?? null
  )
})
const mål = await mittPå(`.karta3d circle[data-produkt="${fri}"]`)
await p.mouse.move(mål.x, mål.y)
await p.waitForTimeout(250)
const pekadRuta = await rutan()
/* Raden under namnet är stilen, inte ett antal. Är det "39 st" har en
   gruppprick svarat och den enskilda drycken prövades aldrig. */
console.log(
  `  ${pekadRuta?.rubrik && !/^\d+ st$/.test(pekadRuta.under) ? '✓' : '✗'} rutan namnger en enskild dryck: ${pekadRuta ? pekadRuta.rubrik + ' · ' + pekadRuta.under : 'ingen ruta'}`,
)
console.log(`  ${(await p.locator('.marke-ring').count()) > 0 ? '✓' : '✗'} ring runt den pekade pricken`)

/* Mätningen börjar efter träffen. Mäter man innan får man med den bit molnet
   hann vrida sig medan pekaren var på väg, och testet blir alltid rött. */
const stod = await mittPå(`.karta3d circle[data-produkt="${fri}"]`)
await p.waitForTimeout(1500)
const står = await mittPå(`.karta3d circle[data-produkt="${fri}"]`)
const rört = Math.hypot(står.x - stod.x, står.y - stod.y)
console.log(`  ${rört < 0.5 ? '✓' : '✗'} molnet stannade av träffen (${rört.toFixed(2)} px på 1,5 s)`)

await p.mouse.move(10, 890)
await p.waitForTimeout(200)
console.log(`  ${(await rutan()) === null ? '✓' : '✗'} rutan släcks när pekaren lämnar kartan`)

/* En gruppprick svarar också, med sitt antal i stället för sin stil. */
const gruppmål = await mittPå('.karta3d circle[data-grupp="Hefeweizen"]')
await p.mouse.move(gruppmål.x, gruppmål.y)
await p.waitForTimeout(200)
const gruppruta = await rutan()
console.log(
  `  ${/^\d+ st$/.test(gruppruta?.under ?? '') ? '✓' : '✗'} en gruppprick svarar med antal: ${gruppruta ? gruppruta.rubrik + ' · ' + gruppruta.under : 'ingen ruta'}`,
)

await p.mouse.move(720, 300)
await p.mouse.down()
await p.mouse.move(820, 340, { steps: 8 })
const underDrag = await rutan()
await p.mouse.up()
console.log(`  ${underDrag === null ? '✓' : '✗'} ingen ruta medan man vrider molnet`)

console.log(fel.length ? '\nKONSOLFEL:\n' + fel.join('\n') : '\ninga konsolfel')
await b.close()
