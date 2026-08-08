/**
 * Test av fas 3 i gränssnittet: att "liknande öl" dyker upp i produktvyn med
 * en förklaring per träff, och att man kan kedja sig vidare från en träff.
 *
 * Enhetstesterna för själva motorn ligger i src/lib/likhet.test.ts och körs
 * med `npm test`. Det här testet kontrollerar kopplingen till appen.
 *
 *   npm run dev            i en terminal
 *   npm run test:likhet
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
await p.waitForSelector('.sok input')
await p.waitForFunction(() => document.querySelector('.sok input')?.placeholder.includes('3'), null, {
  timeout: 20000,
})

// Sök upp en öl de flesta känner igen och gå in i den.
await p.locator('.sok input').fill('guinness draught')
await p.waitForTimeout(250)
await p.locator('.sok input').press('ArrowDown')
await p.locator('.sok input').press('Enter')
await p.waitForSelector('.liknande button')

const bas = await p.locator('.panel h2').textContent()
console.log('utgår från:', bas)

const träffar = await p.locator('.liknande button').count()
console.log('liknande öl:', träffar)

const namn = await p.locator('.l-namn').allTextContents()
const stilar = await p.locator('.l-stil').allTextContents()
const förklaringar = await p.locator('.l-förklaring').allTextContents()
console.log('')
for (let i = 0; i < Math.min(4, namn.length); i++) {
  console.log(`  ${namn[i]}  [${stilar[i]}]`)
  console.log(`    ${förklaringar[i]}`)
}

// Varje träff ska ha en förklaring som är en hel mening.
const tomma = förklaringar.filter((f) => !f.trim().endsWith('.'))
console.log('')
console.log(`  förklaring på varje träff: ${tomma.length === 0 ? '✓' : '✗ ' + tomma.length + ' saknar'}`)

// Ingen träff får vara ölen själv.
console.log(`  utesluter sig själv: ${namn.every((n) => n !== bas) ? '✓' : '✗'}`)

// Kedja vidare: klicka på första träffen och se att den blir den nya basen.
await p.locator('.liknande button').first().click()
await p.waitForTimeout(600)
const ny = await p.locator('.panel h2').textContent()
console.log(`  kedjar vidare: "${bas}" → "${ny}"  ${ny !== bas ? '✓' : '✗'}`)
await p.waitForSelector('.liknande button')
console.log(`  nya träffar: ${await p.locator('.liknande button').count()}`)

await p.screenshot({ path: 'likhet.png' })
console.log(fel.length ? '\nKONSOLFEL:\n' + fel.join('\n') : '\ninga konsolfel')
await b.close()
