import { describe, expect, it } from 'vitest'
import kartorData from './kartor.json'
import type { Karta } from '../lib/typer'

const kartor = kartorData as unknown as Karta[]

/**
 * Ett ord får bara peka åt ett håll.
 *
 * Testet växte med kartan. Först gällde det de fyra platta riktningarna, sedan
 * 3D-läget fick ett axelkors med alla tre axlarna i samma bild — och då stod
 * "sirapslimpa" plötsligt både åt vänster och bort från betraktaren. Nu prövas
 * alla sex, för alla sex ritas samtidigt.
 */
const RIKTNINGAR = [
  ['vänster', 0, 'negativ'],
  ['höger', 0, 'positiv'],
  ['ned', 1, 'negativ'],
  ['upp', 1, 'positiv'],
  ['bort', 2, 'negativ'],
  ['mot', 2, 'positiv'],
] as const

const orden = (k: Karta) =>
  Object.fromEntries(RIKTNINGAR.map(([namn, axel, ände]) => [namn, k.axlar[axel][ände]]))

describe('kartornas axeletiketter', () => {
  it.each(kartor.map((k) => [k.namn, k] as const))(
    '%s: inget ord namnger två riktningar',
    (_, k) => {
      const platser: Record<string, string[]> = {}
      for (const [namn, ord] of Object.entries(orden(k)))
        for (const o of ord) (platser[o] ??= []).push(namn)
      const dubbla = Object.entries(platser).filter(([, r]) => r.length > 1)
      expect(dubbla.map(([o, r]) => `${o}: ${r.join(' + ')}`)).toEqual([])
    },
  )

  /* Räknat per riktning i stället för i en slinga, så att felmeddelandet
     pekar ut vilken riktning som blivit mager. Tre ord är golvet: den platta
     kartan visar tre på bred skärm. */
  it.each(kartor.map((k) => [k.namn, k] as const))('%s: alla sex riktningarna har ord', (_, k) => {
    const antal = Object.fromEntries(Object.entries(orden(k)).map(([n, o]) => [n, o.length]))
    for (const namn of Object.keys(antal)) expect(antal[namn]).toBeGreaterThanOrEqual(3)
  })
})
