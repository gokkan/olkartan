import { useEffect, useMemo, useRef, useState } from 'react'
import type { Produkt } from './lib/typer'

/**
 * Filter på ursprungsland.
 *
 * Till skillnad från ett smakord eller en maträtt är det här inte ett val av
 * något att titta på — det är ett raster över kartan. Därför står det bland
 * reglagen och inte i panelen, och därför öppnar det ingen egen vy: det enda
 * det gör är att låta färre prickar synas.
 *
 * Länderna räknas ur den karta man tittar på, inte ur en fast lista. Sortiment
 * kommer och går, och en lista som påstod att det finns eritreanskt öl den
 * vecka det inte gör det vore ett tomt filter att klicka i.
 */
export default function Landval({
  produkter,
  valda,
  enhet,
  onÄndra,
}: {
  produkter: Produkt[] | null
  valda: string[]
  /** Vad produkterna heter i plural: "öl", "viner". */
  enhet: string
  onÄndra: (länder: string[]) => void
}) {
  const [öppen, setÖppen] = useState(false)
  const ruta = useRef<HTMLDivElement>(null)

  /* Vanligast först. Alfabetisk ordning ser prydligare ut men begraver
     Sverige — 2866 av 3395 öl — under Argentina och Armenien. Den som söker
     ett land vet vilket och hittar det ändå; den som bara öppnar listan ska
     mötas av de som faktiskt finns. */
  const länder = useMemo(() => {
    const c = new Map<string, number>()
    for (const p of produkter ?? []) c.set(p.land, (c.get(p.land) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'sv'))
  }, [produkter])

  /* Ett val som ligger i adressen men inte i sortimentet ska ändå gå att se
     och ta bort. Utan det här blir en delad länk till ett land som just
     försvunnit ur sortimentet ett filter man inte kan öppna sig ur. */
  const försvunna = valda.filter((l) => !länder.some(([namn]) => namn === l))

  useEffect(() => {
    if (!öppen) return
    const utanför = (e: PointerEvent) => {
      if (!ruta.current?.contains(e.target as Node)) setÖppen(false)
    }
    const tangent = (e: KeyboardEvent) => e.key === 'Escape' && setÖppen(false)
    addEventListener('pointerdown', utanför)
    addEventListener('keydown', tangent)
    return () => {
      removeEventListener('pointerdown', utanför)
      removeEventListener('keydown', tangent)
    }
  }, [öppen])

  const växla = (namn: string) =>
    onÄndra(valda.includes(namn) ? valda.filter((l) => l !== namn) : [...valda, namn])

  const etikett =
    valda.length === 0 ? 'alla länder' : valda.length === 1 ? valda[0] : `${valda.length} länder`

  return (
    <div className={`landval${öppen ? ' öppen' : ''}`} ref={ruta}>
      <button
        className={valda.length ? 'aktiv' : undefined}
        aria-expanded={öppen}
        aria-haspopup="true"
        disabled={!produkter}
        onClick={() => setÖppen((v) => !v)}
        title="Filtrera på ursprungsland"
      >
        <span className="landval-namn">land: {etikett}</span>
        <span className="landval-pil" aria-hidden>
          ▾
        </span>
      </button>

      {öppen && (
        <div className="landval-lista" role="group" aria-label="Ursprungsland">
          <button
            className={`landval-alla${valda.length ? '' : ' aktiv'}`}
            onClick={() => onÄndra([])}
          >
            Alla länder
          </button>
          {[...försvunna.map((l) => [l, 0] as const), ...länder].map(([namn, antal]) => (
            <button
              key={namn}
              className={valda.includes(namn) ? 'aktiv' : undefined}
              aria-pressed={valda.includes(namn)}
              onClick={() => växla(namn)}
            >
              <span className="landval-kryss" aria-hidden>
                {valda.includes(namn) ? '✓' : ''}
              </span>
              <span className="landval-land">{namn}</span>
              <span className="landval-antal">
                {antal ? antal.toLocaleString('sv-SE') : `inga ${enhet} just nu`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
