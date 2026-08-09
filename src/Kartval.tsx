import type { Karta } from './lib/typer'
import { palett } from './lib/färg'

/**
 * Val av karta: öl, rött eller vitt.
 *
 * Prickarna framför namnen är samma färgskala som kartan använder, tagna på
 * mitten av varje. Det är den kortaste möjliga förklaringen av vad man byter
 * till, och den kräver ingen text.
 */
export default function Kartval({
  kartor,
  vald,
  onVälj,
}: {
  kartor: Karta[]
  vald: Karta
  onVälj: (id: string) => void
}) {
  return (
    <div className="kartval" role="group" aria-label="Välj karta">
      {kartor.map((k) => (
        <button
          key={k.id}
          className={k.id === vald.id ? 'aktiv' : undefined}
          aria-pressed={k.id === vald.id}
          onClick={() => onVälj(k.id)}
        >
          <span
            className="kartval-prick"
            style={{ background: palett(k.färgskala).fyllning(0.5) }}
          />
          {k.kort}
        </button>
      ))}
    </div>
  )
}
