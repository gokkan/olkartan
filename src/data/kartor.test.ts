import { describe, expect, it } from 'vitest'
import kartorData from './kartor.json'
import type { Karta } from '../lib/typer'

const kartor = kartorData as unknown as Karta[]

/**
 * Axeletiketterna är byggda data, inte kod, så de kan bara kontrolleras mot
 * den byggda filen. Det här testet finns för en bugg som stod på kartan:
 * "svarta vinbär" namngav både vänster och ned på rödvinskartan, och "gula
 * päron" gjorde samma sak på vitvinskartan. Orsaken var att varje axel
 * rankades för sig, så ett ord som pekade snett fick namnge två riktningar —
 * och det är just de diagonala orden som säger minst om vad som skiljer
 * axlarna åt. Se axelOrd i scripts/bygg-data.mjs.
 */
describe('kartornas axeletiketter', () => {
  it.each(kartor.map((k) => [k.namn, k] as const))(
    '%s: inget ord namnger två riktningar',
    (_, k) => {
      const [x, y] = k.axlar
      const riktning: Record<string, string[]> = {
        vänster: x.negativ,
        höger: x.positiv,
        upp: y.positiv,
        ned: y.negativ,
      }
      const platser: Record<string, string[]> = {}
      for (const [namn, ord] of Object.entries(riktning))
        for (const o of ord) (platser[o] ??= []).push(namn)

      const dubbla = Object.entries(platser).filter(([, r]) => r.length > 1)
      expect(dubbla.map(([o, r]) => `${o}: ${r.join(' + ')}`)).toEqual([])
    },
  )

  it.each(kartor.map((k) => [k.namn, k] as const))('%s: alla fyra riktningarna har ord', (_, k) => {
    const [x, y] = k.axlar
    for (const lista of [x.negativ, x.positiv, y.negativ, y.positiv])
      expect(lista.length).toBeGreaterThanOrEqual(3)
  })
})
