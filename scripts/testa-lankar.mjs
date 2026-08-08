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
    document.querySelector('.sok input')?.placeholder.includes('bryggeri'),
  )
}

/* --- 1. Permalänk: en adress ska återskapa urvalet vid inladdning --------- */
console.log('permalänk:')
await p.goto(bas + '#stil=' + encodeURIComponent('Torr porter och stout'), {
  waitUntil: 'networkidle',
})
await klar()
await p.waitForSelector('.panel h2')
console.log('  #stil= → ' + (await p.locator('.panel h2').textContent()))

await p.goto(bas + '#%C3%B6l=507849', { waitUntil: 'networkidle' })
await klar()
await p.waitForSelector('.panel h2')
console.log('  #öl= → ' + (await p.locator('.panel h2').textContent()))

/* --- 2. Urvalet ska hamna i adressfältet när man klickar ----------------- */
await p.goto(bas, { waitUntil: 'networkidle' })
await klar()
await p.locator('circle[data-stil="Hefeweizen"]').click()
await p.waitForTimeout(300)
console.log('  klick skriver hash: ' + decodeURIComponent(new URL(p.url()).hash))

/* --- 3. Bakåtknappen ---------------------------------------------------- */
await p.locator('circle[data-stil="Witbier"]').click()
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
console.log('  prickar på kartan: ' + (await p.locator('circle[data-ol]').count()))
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
console.log('  moln på kartan: ' + (await p.locator('circle[data-ol]').count()))
console.log(`  hamnar i hashen: ${decodeURIComponent(p.url()).includes('mat=Fisk') ? '✓' : '✗'}`)

/* Och tillbaka in i en produkt, där matchipsen ska gå att klicka på. */
await p.goto(bas + '#%C3%B6l=507849', { waitUntil: 'networkidle' })
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

await p.goto(bas + '#%C3%B6l=507849', { waitUntil: 'networkidle' })
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
await p.goto(bas + '#%C3%B6l=62855970', { waitUntil: 'networkidle' })
await klar()
await p.waitForSelector('.panel h2')
await p.waitForTimeout(700)
console.log(
  `  öl utan bild: ${await p.locator('.etikettbild').count()} img-element, ` +
    `${bildanrop.length} anrop  ${bildanrop.length === 0 ? '✓' : '✗ frågar i onödan'}`,
)

/* Och om Systembolaget flyttar sökvägen ska panelen se ut som förut. */
await p.route('**/productimages/**', (r) => r.fulfill({ status: 404, body: '' }))
await p.goto(bas + '#%C3%B6l=507849', { waitUntil: 'networkidle' })
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

/* --- 7. Rama in molnet --------------------------------------------------- */
await p.goto(bas + '#stil=' + encodeURIComponent('India pale ale (IPA)'), {
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
