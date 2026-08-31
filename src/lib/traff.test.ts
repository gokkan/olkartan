import { describe, expect, it } from 'vitest'
import { träffa } from './traff'

const prick = (nyckel: string, px: number, py: number, r = 4) => ({ nyckel, px, py, r })

describe('träffprövningen i molnet', () => {
  /**
   * Det testet filen finns för.
   *
   * `punkter` i `Karta3D` är sorterad bakifrån och fram, så den sist listade
   * pricken är den som ritas överst. Pekar man på ett ställe där två ligger på
   * varandra ska svaret bli den man ser, inte den som är övermålad. Vänder
   * någon på sorteringen utan att tänka på det här går hovringen sönder på ett
   * sätt som är nästan omöjligt att upptäcka för hand: den svarar fortfarande,
   * bara med fel dryck.
   */
  it('den främsta pricken vinner när två ligger på varandra', () => {
    const bakom = prick('bakom', 100, 100)
    const framför = prick('framför', 100, 100)
    expect(träffa([bakom, framför], 100, 100, 1, 2)?.nyckel).toBe('framför')
    expect(träffa([framför, bakom], 100, 100, 1, 2)?.nyckel).toBe('bakom')
  })

  /* Slop:en är skillnaden mellan en prick man kan träffa och en man inte kan.
     Gränsen prövas från båda hållen — en ensidig kontroll skulle passera även
     om räckvidden råkade bli oändlig. */
  it('räckvidden är radien plus slop, och inte mer', () => {
    const p = [prick('en', 0, 0, 4)]
    expect(träffa(p, 6, 0, 1, 2)?.nyckel).toBe('en')
    expect(träffa(p, 6.001, 0, 1, 2)).toBeNull()
    // Utan slop är det bara prickens egen yta som gäller.
    expect(träffa(p, 5, 0, 1, 0)).toBeNull()
    expect(träffa(p, 4, 0, 1, 0)?.nyckel).toBe('en')
  })

  /* Luppen förstorar prickarna på en trång skärm. Räknades räckvidden på
     grundradien vore träffytan mindre än pricken man ser, vilket är det svåraste
     slaget av fel att förstå: det ser ut att fungera, men bara ibland. */
  it('räckvidden växer med luppen', () => {
    const p = [prick('en', 0, 0, 4)]
    expect(träffa(p, 9, 0, 1, 0)).toBeNull()
    expect(träffa(p, 9, 0, 2.5, 0)?.nyckel).toBe('en')
  })

  /* Avståndet är radiellt, inte per led. En prick 5 åt vardera hållet ligger
     7,07 bort och ska missas fast båda leden var för sig ryms. */
  it('mäter avstånd radiellt', () => {
    const p = [prick('en', 0, 0, 4)]
    expect(träffa(p, 5, 5, 1, 2)).toBeNull()
    expect(träffa(p, 4, 4, 1, 2)?.nyckel).toBe('en')
  })

  it('tom lista och ren bom ger null', () => {
    expect(träffa([], 0, 0, 1, 2)).toBeNull()
    expect(träffa([prick('en', 500, 500)], 0, 0, 1, 2)).toBeNull()
  })
})
