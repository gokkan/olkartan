import { describe, expect, it } from 'vitest'
import kartorData from '../data/kartor.json'
import type { Karta } from './typer'
import { axelmeny, plats, rymdmått, skrivAxlar, STANDARD, tolkaAxlar } from './axlar'

const kartor = kartorData as unknown as Karta[]
const fall = kartor.map((k) => [k.namn, k] as const)

/** Radien molnet ska fylla, i ritenheter. Vilket tal som helst duger — det
 *  skalar bara igenom — men ett verkligt gör felmeddelandena läsbara. */
const RADIE = 324

describe('axelvalet', () => {
  /**
   * Det viktigaste testet i filen.
   *
   * Att axlarna gick att välja fick inte flytta en enda prick i standardläget.
   * Den gamla räkningen står skriven en gång till här, rakt på `x`, `y` och
   * `z`, och prövas mot den nya vägen genom `rymdmått` och `plats`. Går de isär
   * har enheten smugit sig in där den skulle vara 1, och molnet är inte längre
   * kartan det utger sig för att vara.
   */
  it.each(fall)('%s: standardaxlarna räknar exakt som förut', (_, karta) => {
    const g = karta.grupper
    const vikt = g.reduce((s, p) => s + p.antal, 0)
    const mitt = {
      x: g.reduce((s, p) => s + p.x * p.antal, 0) / vikt,
      y: g.reduce((s, p) => s + p.y * p.antal, 0) / vikt,
      z: g.reduce((s, p) => s + p.z * p.antal, 0) / vikt,
    }
    const r = Math.max(...g.map((p) => Math.hypot(p.x - mitt.x, p.y - mitt.y, p.z - mitt.z)))
    const skala = RADIE / r

    const axel = tolkaAxlar(karta)
    const rymd = rymdmått(g, axel, RADIE)
    expect(rymd.mitt).toEqual([mitt.x, mitt.y, mitt.z])
    expect(rymd.enhet).toEqual([1, 1, 1])
    expect(rymd.djup).toBe(r)
    expect(rymd.skala).toBe(skala)

    for (const p of g)
      expect(plats(p, axel, rymd)).toEqual([
        (p.x - mitt.x) * skala,
        (p.y - mitt.y) * skala,
        (p.z - mitt.z) * skala,
      ])
  })

  /* En blandad trippel får inte ge en tunn skiva. Molnet ska nå ut till
     sfärens kant på samma sätt som smakrymdens gör, annars är halva ritytan
     bortkastad så fort man rör en meny. */
  it.each(fall)('%s: en blandad trippel fyller sfären', (_, karta) => {
    const klocka = karta.färgkanaler.find((k) => k.sort === 'klocka')!
    const axel = tolkaAxlar(karta, ['pc1', klocka.nyckel, 'pc3'].join(','))
    const rymd = rymdmått(karta.grupper, axel, RADIE)
    const ytterst = Math.max(...karta.grupper.map((p) => Math.hypot(...plats(p, axel, rymd)!)))
    expect(ytterst).toBeCloseTo(RADIE, 6)
    // Varje axel måste ha fått en egen enhet, annars är det inte det som hände.
    expect(rymd.enhet.every((e) => e > 0)).toBe(true)
  })

  /* Grupperna bär hela ramen: sfären, rutnätet och stolparna räknas ur dem.
     Saknade en grupp ett värde skulle skalan hoppa när man bytte axel. */
  it.each(fall)('%s: ingen grupp saknar värde på någon axel', (_, karta) => {
    for (const val of axelmeny(karta)) {
      const utan = karta.grupper.filter((g) => val.värde(g) === null).map((g) => g.namn)
      expect([val.nyckel, utan]).toEqual([val.nyckel, []])
    }
  })

  it.each(fall)('%s: varje val har ord åt båda hållen', (_, karta) => {
    for (const val of axelmeny(karta)) {
      expect(val.spetsar[0].length).toBeGreaterThanOrEqual(1)
      expect(val.spetsar[1].length).toBeGreaterThanOrEqual(1)
      // Samma ord åt båda hållen vore en axel som inte pekar någonstans.
      expect(val.spetsar[0][0]).not.toBe(val.spetsar[1][0])
    }
  })

  /* Beska finns bara för öl. En länk som byter karta ska ge en läsbar karta
     och inte ett tomt moln — precis som färgvalet faller tillbaka. */
  it('en nyckel kartan saknar faller tillbaka på sin plats', () => {
    const rött = kartor.find((k) => k.id === 'rott')!
    expect(tolkaAxlar(rött, 'beska,pc2,fyllighet').map((a) => a.nyckel)).toEqual([
      'pc1',
      'pc2',
      'fyllighet',
    ])
    expect(tolkaAxlar(rött, 'strunt').map((a) => a.nyckel)).toEqual([...STANDARD])
  })

  it.each(fall)('%s: varje val i menyn går att välja tillbaka ur adressen', (_, karta) => {
    for (const val of axelmeny(karta)) {
      const s = skrivAxlar([val.nyckel, 'pc2', 'pc3'])
      expect(tolkaAxlar(karta, s)[0].nyckel).toBe(val.nyckel)
    }
  })

  it('standardtrippeln skriver ingen nyckel alls', () => {
    expect(skrivAxlar([...STANDARD])).toBeUndefined()
    expect(skrivAxlar(['pc1', 'beska', 'pc3'])).toBe('pc1,beska,pc3')
  })
})
