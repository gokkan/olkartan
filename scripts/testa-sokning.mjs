/**
 * Test av sökrutan: träffar, förlåtande jämförelse av å/ä/ö, tangentbord,
 * och att en träff markerar rätt stil på kartan.
 *
 *   npm run dev            i en terminal
 *   npm i -D playwright && npx playwright install chromium   (en gång)
 *   npm run test:sokning
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
await p.waitForSelector('.sok input', { timeout: 20000 })
await p.waitForFunction(
  () => !document.querySelector('.filter span')?.textContent?.includes('…'),
  null,
  { timeout: 20000 },
)
console.log('platshållare:', await p.locator('.sok input').getAttribute('placeholder'))

async function sök(q) {
  await p.locator('.sok input').fill(q)
  await p.waitForTimeout(200)
  const n = await p.locator('.sok-traffar button').count()
  const topp = await p.locator('.sok-traffar .sok-namn').allTextContents()
  console.log(`  "${q}" → ${n} träffar: ${topp.slice(0, 3).join(' | ')}`)
  return n
}

console.log('\nsökningar:')
await sök('guinness')
await sök('omnipollo')
await sök('sot porter')
await sök('porter') // utan prickar — ska ändå hitta "Söt porter"
await sök('ipa')
await sök('xyzzy')

// välj en träff med tangentbordet
console.log('\ntangentbord:')
await p.locator('.sok input').fill('guinness')
await p.waitForTimeout(200)
await p.locator('.sok input').press('ArrowDown')
await p.locator('.sok input').press('Enter')
await p.waitForSelector('.panel h2')
console.log('  vald produkt:', await p.locator('.panel h2').textContent())
console.log('  panelens stil-tillbakalänk:', await p.locator('.tillbaka').textContent())
// Markeringen är numera att grannarna tonas ned medan den valda står kvar
// i full opacitet. Den vita konturen är borta.
const markerad = await p
  .locator('svg circle[data-stil]')
  .evaluateAll((els) =>
    els
      .filter((e) => (e.getAttribute('opacity') ?? '1') === '1')
      .map((e) => e.getAttribute('data-stil')),
  )
console.log('  markerad stil på kartan:', markerad.join(', ') || 'ingen')
await p.screenshot({ path: 'sok.png' })

// och listan stängd efter val
console.log('  listan stängd:', (await p.locator('.sok-traffar').count()) === 0)
console.log(fel.length ? 'KONSOLFEL:\n' + fel.join('\n') : '\ninga konsolfel')
await b.close()
