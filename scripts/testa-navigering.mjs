/**
 * Acceptanstest för fas 2: kartan får inte tappa zoom eller position när
 * man klickar sig runt mellan stilar och produkter.
 *
 *   npm run dev            i en terminal
 *   npm i -D playwright && npx playwright install chromium   (en gång)
 *   npm run test:navigering
 *
 * Playwright ligger utanför projektets beroenden — det är 200 MB och behövs
 * varken för att bygga eller publicera. Deploy-arbetsflödet kör därför inte
 * testerna; kör dem för hand när du rört kartan, panelen eller sökningen.
 *
 * Skicka en annan adress som argument för att testa ett produktionsbygge.
 */
import { chromium } from 'playwright'

const url = 'http://localhost:5173'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const fel = []
p.on('console', (m) => m.type() === 'error' && fel.push(m.text()))
p.on('pageerror', (e) => fel.push(String(e)))

await p.goto(url, { waitUntil: 'networkidle' })
await p.waitForSelector('svg circle')

const transform = () => p.locator('svg > g').getAttribute('transform')

// 1. Sätt en icke-default vy: zooma in och panorera.
await p.mouse.move(700, 400)
await p.mouse.wheel(0, -250)
await p.mouse.move(700, 400)
await p.mouse.down()
await p.mouse.move(620, 460, { steps: 10 })
await p.mouse.up()
await p.waitForTimeout(150)
const efterZoom = await transform()
console.log('vy efter zoom+pan:', efterZoom)

// 2. Klicka på en stil. Välj en namngiven prick via dess etikett-position.
async function klickaStil(namn) {
  await p.locator(`circle[data-stil="${namn}"]`).click()
  await p.waitForTimeout(250)
}

await klickaStil('Torr porter och stout')
await p.waitForSelector('.panel h2')
console.log('vald stil:', await p.locator('.panel h2').textContent())
await p.waitForSelector('.produkter button', { timeout: 15000 })
const antalProdukter = await p.locator('.produkter button').count()
console.log('produkter i listan:', antalProdukter)
console.log(
  'kännetecken:',
  (await p.locator('.termer li').allTextContents()).slice(0, 6).join(', '),
)
await p.screenshot({ path: 'fas2-stil.png' })
const efterStil = await transform()

// 3. Klicka på den mest typiska produkten.
console.log('\ntopp 3 mest typiska:')
for (const t of (await p.locator('.produkter .p-namn').allTextContents()).slice(0, 3))
  console.log('  ' + t)
await p.locator('.produkter button').first().click()
await p.waitForSelector('.tillbaka')
console.log('vald produkt:', await p.locator('.panel h2').textContent())
await p.screenshot({ path: 'fas2-produkt.png' })
const efterProdukt = await transform()

// 4. Tillbaka till stilen, klicka på en grannstil.
await p.locator('.tillbaka').click()
await p.waitForSelector('.grannar button')
const grannar = await p.locator('.grannar button').allTextContents()
console.log('\nnärmaste stilar:', grannar.map((g) => g.trim()).join(' | '))
await p.locator('.grannar button').first().click()
await p.waitForTimeout(250)
console.log('vald grannstil:', await p.locator('.panel h2').textContent())
const efterGranne = await transform()

// 5. Och in i en produkt där.
await p.waitForSelector('.produkter button')
await p.locator('.produkter button').first().click()
await p.waitForSelector('.tillbaka')
console.log('vald produkt i grannstil:', await p.locator('.panel h2').textContent())
await p.screenshot({ path: 'fas2-granne.png' })
const slut = await transform()

// 6. Acceptanskriteriet.
const alla = [efterStil, efterProdukt, efterGranne, slut]
const stabil = alla.every((t) => t === efterZoom)
console.log('\n--- acceptanskriterium ---')
console.log('kartans transform genom hela navigeringen:', stabil ? 'OFÖRÄNDRAD ✓' : 'ÄNDRADES ✗')
if (!stabil) console.log(' start:', efterZoom, '\n  slut:', slut)
console.log(fel.length ? 'KONSOLFEL:\n' + fel.join('\n') : 'inga konsolfel')
await b.close()
