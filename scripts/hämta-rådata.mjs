/**
 * Hämtar hela sortimentet till data/rå/products.json (~100 MB).
 *
 * Källan är en community-spegel av Systembolagets öppna sortimentsdata. Den
 * driftas av en privatperson, så: hämta sällan, cacha lokalt, committa aldrig
 * råfilen. Filen ligger i .gitignore av just det skälet.
 */

import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MÅL = resolve(ROT, 'data/rå/products.json')
const KÄLLA = 'https://susbolaget.emrik.org/v1/products'
const MAX_ÅLDER_DYGN = 7

if (existsSync(MÅL) && !process.argv.includes('--tvinga')) {
  const ålder = (Date.now() - statSync(MÅL).mtimeMs) / 86_400_000
  if (ålder < MAX_ÅLDER_DYGN) {
    console.log(
      `råfilen är ${ålder.toFixed(1)} dygn gammal — hoppar över hämtning.\n` +
        `kör med --tvinga för att hämta ändå.`,
    )
    process.exit(0)
  }
}

console.log(`hämtar ${KÄLLA} …`)
const svar = await fetch(KÄLLA)
if (!svar.ok) {
  console.error(`fick HTTP ${svar.status} från källan.`)
  process.exit(1)
}
const text = await svar.text()

// Kontrollera att det är giltig JSON innan vi skriver över en fungerande fil.
const data = JSON.parse(text)
if (!Array.isArray(data) || data.length < 1000) {
  console.error(`oväntat svar: ${Array.isArray(data) ? data.length + ' poster' : typeof data}`)
  process.exit(1)
}

mkdirSync(dirname(MÅL), { recursive: true })
writeFileSync(MÅL, text)
console.log(
  `skrev ${data.length} produkter (${(text.length / 1e6).toFixed(0)} MB) till data/rå/products.json`,
)
