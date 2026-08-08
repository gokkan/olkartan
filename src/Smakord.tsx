import { useMemo } from 'react'
import type { Produkt } from './lib/typer'
import { bryggeriRad, heltNamn, kr } from './lib/urval'
import { srm } from './lib/färg'

/**
 * Alla öl som beskrivs med ett visst smakord.
 *
 * Det här är frågan ingen annan öl-app kan besvara, och den kostade ingenting
 * att bygga: orden är redan utplockade ur Systembolagets smaktexter för att
 * kartan ska fungera.
 */
export default function Smakord({
  ord,
  produkter,
  vald,
  onVäljProdukt,
  onStäng,
}: {
  ord: string
  produkter: Produkt[]
  vald: Produkt | null
  onVäljProdukt: (p: Produkt) => void
  onStäng: () => void
}) {
  const träffar = useMemo(() => produkter.filter((p) => p.termer.includes(ord)), [produkter, ord])

  /* Vilka stilar ordet hör hemma i. Ett ord som "kavring" samlas i porter och
     stout; "grapefrukt" ligger i IPA-hörnet. Fördelningen säger något om
     ordet i sig. */
  const stilar = useMemo(() => {
    const c = new Map<string, number>()
    for (const p of träffar) c.set(p.stil, (c.get(p.stil) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [träffar])

  return (
    <aside className="panel">
      <button className="stäng" onClick={onStäng} aria-label="Stäng panelen">
        ×
      </button>

      <p className="meta">smakord</p>
      <h2>{ord}</h2>
      <p className="undertitel">{träffar.length} öl beskrivs med det ordet</p>

      {stilar.length > 0 && (
        <>
          <h3>Vanligast i</h3>
          <ul className="termer">
            {stilar.map(([namn, n]) => (
              <li key={namn}>
                {namn} · {n}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Ölen</h3>
      <ol className="produkter">
        {träffar.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => onVäljProdukt(p)}
              className={vald?.id === p.id ? 'markerad' : undefined}
            >
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
    </aside>
  )
}
