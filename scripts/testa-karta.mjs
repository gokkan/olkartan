/**
 * Test av kartans rörelse: att hjulet ger ett mjukt glid i stället för ett
 * hopp, att en sökträff flyger in, och att ölmolnet går att klicka i.
 *
 *   npm run dev            i en terminal
 *   npm i -D playwright && npx playwright install chromium   (en gång)
 *   npm run test:karta
 *
 * Playwright ligger utanför projektets beroenden — det är 200 MB och behövs
 * varken för att bygga eller publicera. Deploy-arbetsflödet kör därför inte
 * testerna; kör dem för hand när du rört kartan, panelen eller sökningen.
 *
 * Skicka en annan adress som argument för att testa ett produktionsbygge.
 */
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:5173'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const fel = []
p.on('console', (m) => m.type() === 'error' && fel.push(m.text()))
p.on('pageerror', (e) => fel.push(String(e)))

await p.goto(url, { waitUntil: 'networkidle' })
await p.waitForSelector('svg circle')

const skala = async () => {
  const t = await p.locator('svg > g').getAttribute('transform')
  return parseFloat(t.match(/scale\(([\d.]+)\)/)[1])
}

// 1. MJUKT GLID: ett hjulryck ska ge många mellansteg, inte ett hopp.
console.log('mjuk zoom:')
const prover = []
await p.mouse.move(700, 400)
const stopp = setInterval(async () => {}, 0)
clearInterval(stopp)
await p.mouse.wheel(0, -400)
for (let i = 0; i < 14; i++) {
  prover.push(await skala())
  await p.waitForTimeout(28)
}
const unika = new Set(prover.map((v) => v.toFixed(3))).size
console.log(`  ${prover.length} prov, ${unika} olika skalvärden`)
console.log(
  `  förlopp: ${prover
    .slice(0, 6)
    .map((v) => v.toFixed(2))
    .join(' → ')} …`,
)
console.log(`  ${unika > 4 ? '✓ glider' : '✗ hackar (hoppar direkt till målet)'}`)

// 2. INFLYGNING VID SÖKNING
console.log('\ninflygning från sökning:')
await p.waitForFunction(
  () => document.querySelector('.sok input')?.placeholder.includes('3'),
  null,
  {
    timeout: 20000,
  },
)
const före = await skala()
await p.locator('.sok input').fill('guinness extra')
await p.waitForTimeout(250)
await p.locator('.sok input').press('ArrowDown')
await p.locator('.sok input').press('Enter')
const under = []
for (let i = 0; i < 12; i++) {
  under.push(await skala())
  await p.waitForTimeout(30)
}
await p.waitForTimeout(700)
const efter = await skala()
console.log(`  skala ${före.toFixed(2)} → ${efter.toFixed(2)}`)
console.log(`  mellansteg: ${new Set(under.map((v) => v.toFixed(3))).size} olika värden`)
console.log(`  ${efter > före + 1 ? '✓ flög in' : '✗ flyttade sig inte'}`)

// 3. ÖLMOLNET
console.log('\nölmoln:')
const antalÖl = await p.locator('circle[data-ol]').count()
console.log(`  prickar för enskilda öl: ${antalÖl}`)
const valdStil = await p.locator('.panel h2').textContent()
console.log(`  vald: ${valdStil}`)
await p.screenshot({ path: 'moln.png' })

// klick på en ölprick i molnet ska öppna den ölen
const innan = await p.locator('.panel h2').textContent()
// välj en prick som faktiskt syns i vyn
const synlig = await p.locator('circle[data-ol]').evaluateAll((els) => {
  for (const e of els) {
    const r = e.getBoundingClientRect()
    if (r.left > 60 && r.right < 1000 && r.top > 60 && r.bottom < 840)
      return e.getAttribute('data-ol')
  }
  return null
})
console.log('  klickar på ölprick', synlig)
await p.locator(`circle[data-ol="${synlig}"]`).click()
await p.waitForTimeout(300)
const efterKlick = await p.locator('.panel h2').textContent()
console.log(`  klick i molnet: "${innan}" → "${efterKlick}"`)
console.log(`  ${innan !== efterKlick ? '✓ öppnade en annan öl' : '✗ inget hände'}`)

console.log(fel.length ? '\nKONSOLFEL:\n' + fel.join('\n') : '\ninga konsolfel')
await b.close()
