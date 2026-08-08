/**
 * Test på telefonskärm: nypzoom med två fingrar, och att axelorden inte
 * breder ut sig över kartan.
 *
 *   npm run dev            i en terminal
 *   npm run test:mobil
 *
 * Beröringen skickas via CDP:s Input.dispatchTouchEvent, inte som
 * hemmasnickrade PointerEvent. Chromium gör om dem till pointer events precis
 * som på en riktig telefon — syntetiska pointer events tar en annan väg genom
 * webbläsaren och ger falskt negativt.
 *
 * Skicka en annan adress som argument för att testa ett produktionsbygge.
 */
import { chromium, devices } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:5173'
const b = await chromium.launch()
const ctx = await b.newContext({ ...devices['Pixel 7'], isMobile: true, hasTouch: true })
const p = await ctx.newPage()
const fel = []
p.on('console', (m) => m.type() === 'error' && fel.push(m.text()))
p.on('pageerror', (e) => fel.push(String(e)))

await p.goto(url, { waitUntil: 'networkidle' })
await p.waitForSelector('svg circle')
const cdp = await ctx.newCDPSession(p)
const skärm = p.viewportSize()
console.log(`skärm: ${skärm.width}×${skärm.height}`)

const skala = async () =>
  parseFloat((await p.locator('svg > g').getAttribute('transform')).match(/scale\(([\d.]+)\)/)[1])

async function nyp(från, till) {
  const my = 300
  const mx = Math.round(skärm.width / 2)
  const punkter = (d) => [
    { x: mx - d, y: my, id: 1, radiusX: 5, radiusY: 5, force: 1 },
    { x: mx + d, y: my, id: 2, radiusX: 5, radiusY: 5, force: 1 },
  ]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punkter(från) })
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: punkter(från + ((till - från) * i) / 10),
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await p.waitForTimeout(400)
}

const start = await skala()
await nyp(50, 170)
const inzoomad = await skala()
console.log(
  `nypa isär:  ${start.toFixed(2)} → ${inzoomad.toFixed(2)}  ${inzoomad > start * 1.5 ? '✓' : '✗'}`,
)

await nyp(170, 60)
const utzoomad = await skala()
console.log(
  `nypa ihop:  ${inzoomad.toFixed(2)} → ${utzoomad.toFixed(2)}  ${utzoomad < inzoomad * 0.7 ? '✓' : '✗'}`,
)

/* Axelorden ska inte äta upp skärmen. */
const axlar = await p.locator('.axel').evaluateAll((els) =>
  els.map((e) => ({
    text: e.textContent.trim(),
    andel: e.getBoundingClientRect().width / innerWidth,
  })),
)
console.log('\naxelord:')
for (const a of axlar) console.log(`  "${a.text}"  ${(a.andel * 100).toFixed(0)}% av bredden`)
const värst = Math.max(...axlar.map((a) => a.andel))
console.log(`  bredaste: ${(värst * 100).toFixed(0)}%  ${värst < 0.45 ? '✓' : '✗ för brett'}`)

/* Sökrutan är nästan skärmbred på telefon och låg tidigare rakt över
   uppåtpilen. Rutorna får inte överlappa. */
const krock = await p.evaluate(() => {
  const a = document.querySelector('.axel.upp').getBoundingClientRect()
  const s = document.querySelector('.sok').getBoundingClientRect()
  return {
    upp: [Math.round(a.top), Math.round(a.bottom)],
    sok: [Math.round(s.top), Math.round(s.bottom)],
    krockar: a.top < s.bottom && a.bottom > s.top && a.left < s.right && a.right > s.left,
  }
})
console.log(
  `\nuppåtpilen ${krock.upp.join('–')} px, sökrutan ${krock.sok.join('–')} px: ` +
    (krock.krockar ? '✗ ligger under sökrutan' : '✓ fri'),
)

/* Panelen ska gå att öppna med ett finger. */
await p.touchscreen.tap(skärm.width / 2, 200)
await p.waitForTimeout(400)
const panel = await p.locator('.panel h2').count()
console.log(`\npanelen öppnas vid tryck: ${panel ? '✓' : '— ingen prick där, hoppar över'}`)
await p.screenshot({ path: 'mobil.png' })

console.log(fel.length ? '\nKONSOLFEL:\n' + fel.join('\n') : '\ninga konsolfel')
await b.close()
