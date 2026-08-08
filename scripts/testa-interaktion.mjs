/**
 * Test av kartans och kortets beteende:
 *   1. att en stil slutar lysa när pekaren dras bort
 *   2. att panoreringen har gränser så att kartan inte går att tappa bort
 *   3. att kortet glider upp på telefon och går att svepa ned igen
 *
 *   npm run dev            i en terminal
 *   npm run test:interaktion
 *
 * Svepet skickas via CDP:s Input.dispatchTouchEvent. Hemmasnickrade
 * PointerEvent tar en annan väg genom webbläsaren och ger falskt negativt.
 *
 * Skicka en annan adress som argument för att testa ett produktionsbygge.
 */
import { chromium, devices } from 'playwright'
const bas = process.argv[2] ?? 'http://localhost:5173'
const b = await chromium.launch()
const fel = []

/* ---- 1 & 2: hover och panoreringsgränser, på dator ---- */
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
p.on('pageerror', (e) => fel.push(String(e)))
p.on('console', (m) => m.type() === 'error' && fel.push(m.text()))
await p.goto(bas, { waitUntil: 'networkidle' })
await p.waitForSelector('svg circle')

const upplysta = () =>
  p
    .locator('svg circle[data-stil]')
    .evaluateAll((els) =>
      els
        .filter((e) => (e.getAttribute('stroke') ?? '').includes('0.85'))
        .map((e) => e.getAttribute('data-stil')),
    )

const prick = p.locator('circle[data-stil="Hefeweizen"]')
const box = await prick.boundingBox()
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await p.waitForTimeout(150)
console.log('hover på pricken:', (await upplysta()).join(', ') || 'ingen')
await p.mouse.move(box.x + 300, box.y + 220) // ut i tomma rutan
await p.waitForTimeout(200)
const kvar = await upplysta()
console.log('efter att pekaren dragits bort:', kvar.join(', ') || 'ingen')
console.log(`  ${kvar.length === 0 ? '✓ släpper' : '✗ lyser kvar'}`)

const vy = async () => {
  const t = await p.locator('svg > g').getAttribute('transform')
  return {
    tx: parseFloat(t.match(/translate\((-?[\d.]+)/)[1]),
    ty: parseFloat(t.match(/translate\(-?[\d.]+ (-?[\d.]+)/)[1]),
  }
}
// dra så långt det bara går, flera gånger
for (let i = 0; i < 5; i++) {
  await p.mouse.move(1000, 700)
  await p.mouse.down()
  await p.mouse.move(200, 100, { steps: 6 })
  await p.mouse.up()
}
await p.waitForTimeout(400)
const långtBort = await vy()
const synliga = await p.locator('svg circle[data-stil]').evaluateAll(
  (els) =>
    els.filter((e) => {
      const r = e.getBoundingClientRect()
      return r.width && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight
    }).length,
)
console.log(`\nefter fem hårda drag: tx=${långtBort.tx.toFixed(0)} ty=${långtBort.ty.toFixed(0)}`)
console.log(
  `  prickar kvar i bild: ${synliga}  ${synliga > 0 ? '✓ kartan går att hitta tillbaka till' : '✗ helt borta'}`,
)

/* ---- 3: kortet på telefon ---- */
const ctx = await b.newContext({ ...devices['Pixel 7'] })
const m = await ctx.newPage()
m.on('pageerror', (e) => fel.push(String(e)))
m.on('console', (e) => e.type() === 'error' && fel.push(e.text()))
await m.goto(bas, { waitUntil: 'networkidle' })
await m.waitForSelector('svg circle')

// Kortet ska glida upp underifrån, inte bara stå där. Rörelsen ligger i en
// övergång på transform, så det som mäts är att den finns.
const övergång = await m.evaluate(() => {
  const s = document.createElement('div')
  s.className = 'panel'
  document.body.append(s)
  const cs = getComputedStyle(s)
  const svar = `${cs.transitionProperty} ${cs.transitionDuration}`
  s.remove()
  return svar
})
console.log(
  `\nkortets övergång: ${övergång}  ${övergång.startsWith('transform') && övergång !== 'transform 0s' ? '✓' : '✗'}`,
)

// välj en prick som faktiskt syns i den inzoomade mobilvyn
const synligStil = await m.locator('svg circle[data-stil]').evaluateAll((els) => {
  for (const e of els) {
    const r = e.getBoundingClientRect()
    if (
      r.width > 6 &&
      r.left > 20 &&
      r.right < innerWidth - 20 &&
      r.top > 220 &&
      r.bottom < innerHeight - 120
    )
      return e.getAttribute('data-stil')
  }
  return null
})
console.log('trycker på:', synligStil)
await m.locator(`circle[data-stil="${synligStil}"]`).tap()
await m.waitForSelector('.panel h2')
console.log('kortet öppnat:', await m.locator('.panel h2').textContent())
console.log('greppet syns:', (await m.locator('.grepp').isVisible()) ? '✓' : '✗')
await m.waitForTimeout(400)
await m.screenshot({ path: 'kort.png' })

// svep ned greppet med riktiga touch-händelser
const cdp = await ctx.newCDPSession(m)
const g = await m.locator('.grepp').boundingBox()
const gx = Math.round(g.x + g.width / 2)
const gy = Math.round(g.y + g.height / 2)
const rör = (y) => [{ x: gx, y, id: 1, radiusX: 5, radiusY: 5, force: 1 }]
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: rör(gy) })
for (let i = 1; i <= 10; i++)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: rör(gy + i * 22) })
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await m.waitForTimeout(600)
const kvarEfterSvep = await m.locator('.panel').count()
console.log(`svep ned: kortet ${kvarEfterSvep === 0 ? 'stängdes ✓' : 'ligger kvar ✗'}`)

console.log(fel.length ? '\nKONSOLFEL:\n' + fel.join('\n') : '\ninga konsolfel')
await b.close()
