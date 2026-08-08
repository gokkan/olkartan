import type { Produkt } from './lib/typer'
import { bryggeriRad, heltNamn, kr } from './lib/urval'
import { srm } from './lib/färg'

/**
 * Listan över öl, som den ser ut i smakords- och matvyn. Där kommer ölen från
 * flera stilar, så färgprickens mörkhet är enda ledtråden till vad man ser —
 * i stilvyn står stilen redan i rubriken och prickarna vore brus.
 */
export default function Produktlista({
  produkter,
  vald,
  onVälj,
}: {
  produkter: Produkt[]
  vald: Produkt | null
  onVälj: (p: Produkt) => void
}) {
  return (
    <ol className="produkter">
      {produkter.map((p) => (
        <li key={p.id}>
          <button onClick={() => onVälj(p)} className={vald?.id === p.id ? 'markerad' : undefined}>
            <span className="p-namn">
              <span className="p-prick" style={{ background: srm(p.mörkhet) }} />
              {heltNamn(p)}
            </span>
            <span className="p-meta">{bryggeriRad(p)}</span>
            <span className="p-tal">
              {p.stil} · {p.abv} % · {kr(p.prisPerLiter)}
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}
