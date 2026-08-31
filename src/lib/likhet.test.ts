import { describe, expect, it } from 'vitest'
import type { Klockaxel, Produkt } from './typer'
import { avstånd, förklara, klockskillnader, liknande, ärSammaÖl } from './likhet'

/** Frekvenser för testens smakord. Låga tal betyder ovanligt och därmed
 *  värt att nämna; "frukt" är med som exempel på ett intetsägande ord. */
const FREKVENS = {
  kaffe: 12,
  kavring: 9,
  choklad: 40,
  lakrits: 15,
  grapefrukt: 30,
  tallbarr: 8,
  frukt: 900,
  rostad: 20,
  stavfel: 1,
}

/** Ölkartans klockor. Testerna gäller motorn, inte en viss dryck, men de
 *  behöver en uppsättning axlar att räkna med. */
const AXLAR: Klockaxel[] = [
  { nyckel: 'beska', etikett: 'beska', max: 10 },
  { nyckel: 'fyllighet', etikett: 'fyllighet', max: 12 },
  { nyckel: 'sötma', etikett: 'sötma', max: 11 },
]

let räknare = 0

function öl(delar: Partial<Produkt> = {}): Produkt {
  räknare++
  return {
    id: String(räknare),
    nummer: String(100000 + räknare),
    namn: 'Testöl ' + räknare,
    undertitel: null,
    bryggeri: 'Bryggeri ' + räknare,
    land: 'Sverige',
    grupper: ['Torr porter och stout'],
    förälder: 'Porter & Stout',
    abv: 5,
    pris: 30,
    volym: 330,
    prisPerLiter: 90,
    sortiment: 'Fast sortiment',
    klockor: { beska: 6, fyllighet: 7, sötma: 2 },
    fatlagrad: false,
    mat: ['Nöt'],
    servering: 'Serveras vid 8-10°C som sällskapsdryck.',
    bild: true,
    mörkhet: 1,
    smaktext: 'Maltig smak.',
    termer: ['kaffe', 'kavring'],
    smakord: ['kaffe', 'kavring'],
    vektor: [0, 0, 0],
    x: 0,
    y: 0,
    z: 0,
    ...delar,
  }
}

describe('avstånd', () => {
  it('är noll för identiska vektorer', () => {
    expect(avstånd([1, 2, 3], [1, 2, 3])).toBe(0)
  })

  it('räknar euklidiskt', () => {
    expect(avstånd([0, 0], [3, 4])).toBe(5)
  })
})

describe('förklara', () => {
  it('säger att profilen är identisk när ingenting skiljer', () => {
    const a = öl()
    const b = öl({ termer: ['kaffe', 'kavring'], smakord: ['kaffe', 'kavring'] })
    expect(förklara(a, b, FREKVENS, AXLAR)).toBe('Nästan identisk smakprofil.')
  })

  it('nämner axeln som skiljer, och den de ligger närmast på', () => {
    const a = öl({ klockor: { beska: 6, fyllighet: 7, sötma: 2 } })
    const b = öl({ klockor: { beska: 3, fyllighet: 7, sötma: 2 } })
    const text = förklara(a, b, FREKVENS, AXLAR)
    expect(text).toContain('tydligt mindre beska')
    // Fyllighet och sötma är identiska; den närmaste axeln nämns först.
    expect(text).toMatch(/^Samma (fyllighet|sötma)/)
  })

  it('skiljer på svag och tydlig skillnad', () => {
    const a = öl({ klockor: { beska: 6, fyllighet: 7, sötma: 2 } })
    expect(
      förklara(a, öl({ klockor: { beska: 7.5, fyllighet: 7, sötma: 2 } }), FREKVENS, AXLAR),
    ).toContain('något mer beska')
    expect(
      förklara(a, öl({ klockor: { beska: 9, fyllighet: 7, sötma: 2 } }), FREKVENS, AXLAR),
    ).toContain('tydligt mer beska')
  })

  it('hanterar skillnad på alla tre axlarna', () => {
    const a = öl({ klockor: { beska: 2, fyllighet: 3, sötma: 1 } })
    const b = öl({ klockor: { beska: 9, fyllighet: 11, sötma: 8 } })
    const text = förklara(a, b, FREKVENS, AXLAR)
    // Med bara skillnader finns ingen "samma"-axel att inleda med.
    expect(text).not.toContain('samma')
    // Högst två axlar nämns, annars blir meningen en uppräkning.
    expect(text.match(/tydligt|något/gi)?.length).toBe(2)
    expect(text).toContain('tydligt mer')
  })

  it('utelämnar en axel där värdet saknas i stället för att räkna den som noll', () => {
    const a = öl({ klockor: { beska: 6, fyllighet: 7, sötma: 2 } })
    const b = öl({ klockor: { beska: 6, fyllighet: 7, sötma: undefined as unknown as number } })
    expect(klockskillnader(a, b, AXLAR).map((s) => s.namn)).toEqual(['beska', 'fyllighet'])
    expect(förklara(a, b, FREKVENS, AXLAR)).not.toContain('sötma')
  })

  it('säger till när ölen inte delar några smakord', () => {
    const a = öl({ termer: ['kaffe', 'kavring'], smakord: ['kaffe', 'kavring'] })
    const b = öl({ termer: ['grapefrukt', 'tallbarr'], smakord: ['grapefrukt', 'tallbarr'] })
    // Leden binds här med komma, inte "och" — båda innehåller redan ett, och
    // "mer tallbarr och grapefrukt och mindre kavring och kaffe" är oläsligt.
    expect(förklara(a, b, FREKVENS, AXLAR)).toBe(
      'Samma styrka i beska, fyllighet och sötma. ' +
        'Inga gemensamma smakord: mer tallbarr och grapefrukt, mindre kavring och kaffe.',
    )
  })

  it('väljer ovanliga smakord före intetsägande', () => {
    const a = öl({ termer: ['kaffe'], smakord: ['kaffe'] })
    const b = öl({
      termer: ['kaffe', 'frukt', 'tallbarr'],
      smakord: ['kaffe', 'frukt', 'tallbarr'],
    })
    const text = förklara(a, b, FREKVENS, AXLAR)
    // tallbarr (8) är ovanligare än frukt (900) och ska nämnas först.
    expect(text).toContain('tallbarr')
    expect(text).not.toContain('frukt,')
  })

  it('nämner inte ord som bara ett fåtal öl har — de är oftast stavfel', () => {
    const a = öl({ termer: ['kaffe'], smakord: ['kaffe'] })
    const b = öl({
      termer: ['kaffe', 'stavfel', 'lakrits'],
      smakord: ['kaffe', 'stavfel', 'lakrits'],
    })
    expect(förklara(a, b, FREKVENS, AXLAR)).toContain('lakrits')
    expect(förklara(a, b, FREKVENS, AXLAR)).not.toContain('stavfel')
  })

  it('bygger en hel mening av båda halvorna', () => {
    const a = öl({
      klockor: { beska: 6, fyllighet: 7, sötma: 2 },
      termer: ['kaffe', 'lakrits'],
      smakord: ['kaffe', 'lakrits'],
    })
    const b = öl({
      klockor: { beska: 3, fyllighet: 7, sötma: 2 },
      termer: ['kaffe', 'choklad'],
      smakord: ['kaffe', 'choklad'],
    })
    expect(förklara(a, b, FREKVENS, AXLAR)).toBe(
      'Samma fyllighet, tydligt mindre beska. Delar kaffe, men mer choklad och mindre lakrits.',
    )
  })
})

describe('ärSammaÖl', () => {
  it('känner igen samma produkt', () => {
    const a = öl()
    expect(ärSammaÖl(a, a)).toBe(true)
  })

  it('känner igen samma öl i en annan burkstorlek', () => {
    const a = öl({ namn: 'Guinness', undertitel: 'Draught', volym: 330 })
    const b = öl({ namn: 'Guinness', undertitel: 'Draught', volym: 440 })
    expect(ärSammaÖl(a, b)).toBe(true)
  })

  it('känner igen samma serie från samma bryggeri', () => {
    const a = öl({ namn: 'Omnipollo', undertitel: 'Zodiak', bryggeri: 'Omnipollo' })
    const b = öl({ namn: 'Omnipollo', undertitel: 'Zodiak IPA', bryggeri: 'Omnipollo' })
    expect(ärSammaÖl(a, b)).toBe(true)
  })

  it('blandar inte ihop olika öl från samma bryggeri', () => {
    const a = öl({ namn: 'Omnipollo', undertitel: 'Zodiak', bryggeri: 'Omnipollo' })
    const b = öl({ namn: 'Omnipollo', undertitel: 'Nebuchadnezzar', bryggeri: 'Omnipollo' })
    expect(ärSammaÖl(a, b)).toBe(false)
  })

  it('blandar inte ihop likadana namn från olika bryggerier', () => {
    const a = öl({ namn: 'Porter', bryggeri: 'A' })
    const b = öl({ namn: 'Porter Extra', bryggeri: 'B' })
    expect(ärSammaÖl(a, b)).toBe(false)
  })
})

describe('liknande', () => {
  it('sorterar efter avstånd och utesluter ölen själv', () => {
    const bas = öl({ vektor: [0, 0] })
    const nära = öl({ vektor: [0.1, 0] })
    const fjärran = öl({ vektor: [5, 5] })
    const träffar = liknande(bas, [bas, fjärran, nära], FREKVENS, AXLAR)
    expect(träffar.map((t) => t.produkt.id)).toEqual([nära.id, fjärran.id])
    expect(träffar[0].avstånd).toBeLessThan(träffar[1].avstånd)
  })

  it('utesluter samma öl i annan storlek', () => {
    const bas = öl({ namn: 'Guinness', undertitel: 'Draught', vektor: [0, 0] })
    const burk = öl({ namn: 'Guinness', undertitel: 'Draught', vektor: [0, 0] })
    const annan = öl({ namn: 'Carnegie', undertitel: 'Porter', vektor: [1, 1] })
    expect(liknande(bas, [burk, annan], FREKVENS, AXLAR).map((t) => t.produkt.namn)).toEqual([
      'Carnegie',
    ])
  })

  it('ger aldrig fler träffar än man bett om', () => {
    const bas = öl({ vektor: [0, 0] })
    const andra = Array.from({ length: 20 }, (_, i) => öl({ vektor: [i + 1, 0] }))
    expect(liknande(bas, andra, FREKVENS, AXLAR, 5)).toHaveLength(5)
  })

  it('förklarar varje träff', () => {
    const bas = öl({ vektor: [0, 0] })
    const andra = [
      öl({
        klockor: { beska: 9, fyllighet: 7, sötma: 2 },
        vektor: [1, 0],
        termer: ['grapefrukt'],
        smakord: ['grapefrukt'],
      }),
    ]
    const [träff] = liknande(bas, andra, FREKVENS, AXLAR)
    expect(träff.förklaring.length).toBeGreaterThan(10)
    expect(träff.förklaring.endsWith('.')).toBe(true)
  })
})
