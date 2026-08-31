import type { Karta } from './lib/typer'
import { axelmeny, type Axelval as Val } from './lib/axlar'

/**
 * Vad de tre riktningarna i molnet ska visa.
 *
 * Tre menyer och inte tre knappar: valen är åtta per axel och växer med
 * kartan, och en rad piller hade tagit hela reglaget. Menyerna står staplade
 * fast de skulle kunna dela rad — dels ryms tre inte i reglagets bredd, dels
 * läser en stapel som en tilldelning: x får det här, y det där.
 *
 * En dimension kan bara ligga på en axel åt gången. Samma klocka på två axlar
 * ger ett moln som är en linje, och det är ingen bild av någonting — därför är
 * det som redan är valt gråat i de andra menyerna i stället för att gå att
 * välja och sedan se konstigt ut.
 */
const RIKTNINGAR = ['x', 'y', 'z'] as const

const FACK: [string, Val['sort']][] = [
  ['smakrymden', 'rymd'],
  ['smakprofil', 'klocka'],
  ['om flaskan', 'annat'],
]

export default function Axelval({
  karta,
  valda,
  onÄndra,
}: {
  karta: Karta
  /** Nycklarna på x, y och z. */
  valda: string[]
  onÄndra: (tre: string[]) => void
}) {
  const meny = axelmeny(karta)

  return (
    <div className="axelval" role="group" aria-label="Välj vad axlarna visar">
      {RIKTNINGAR.map((riktning, i) => (
        <label key={riktning}>
          <span aria-hidden>{riktning}</span>
          <select
            aria-label={`${riktning}-axeln`}
            value={valda[i]}
            onChange={(e) => onÄndra(valda.map((v, j) => (j === i ? e.target.value : v)))}
          >
            {FACK.map(([etikett, sort]) => (
              <optgroup key={sort} label={etikett}>
                {meny
                  .filter((a) => a.sort === sort)
                  .map((a) => (
                    <option
                      key={a.nyckel}
                      value={a.nyckel}
                      disabled={valda.some((v, j) => j !== i && v === a.nyckel)}
                      /* Menyn har plats för ett ord åt varje håll. Resten —
                         upp till sex per riktning — ligger här. */
                      title={`${a.spetsar[0].join(', ')} → ${a.spetsar[1].join(', ')}`}
                    >
                      {a.etikett}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      ))}
    </div>
  )
}
