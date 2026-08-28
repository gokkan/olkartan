import type { Karta, Produkt } from './lib/typer'
import { grupprad, heltNamn, kr, producentRad } from './lib/urval'
import { palett } from './lib/färg'

/**
 * Listan över produkter, som den ser ut i smakords- och matvyn. Där kommer de
 * från flera grupper, så färgprickens mörkhet är enda ledtråden till vad man
 * ser — i gruppvyn står gruppen redan i rubriken och prickarna vore brus.
 */
export default function Produktlista({
  karta,
  produkter,
  onVälj,
  onMarkera,
}: {
  karta: Karta
  produkter: Produkt[]
  onVälj: (p: Produkt) => void
  /** Pekaren över en rad lyser upp drycken på kartan. Nollställs också på
   *  listan som helhet: lämnar man den snett över en kant hinner raden inte
   *  alltid säga ifrån, och då lyser en markering kvar utan pekare. */
  onMarkera: (p: Produkt | null) => void
}) {
  const kulör = palett(karta.färgskala)
  return (
    <ol className="produkter" onPointerLeave={() => onMarkera(null)}>
      {produkter.map((p) => (
        <li key={p.id}>
          <button
            onClick={() => onVälj(p)}
            onPointerEnter={() => onMarkera(p)}
            onPointerLeave={() => onMarkera(null)}
          >
            <span className="p-namn">
              <span className="p-prick" style={{ background: kulör.fyllning(p.mörkhet) }} />
              {heltNamn(p)}
            </span>
            <span className="p-meta">{producentRad(p)}</span>
            <span className="p-tal">
              {grupprad(p, karta)} · {p.abv} % · {kr(p.prisPerLiter)}
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}
