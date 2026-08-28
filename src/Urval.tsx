import { useMemo } from 'react'
import type { Karta, Produkt } from './lib/typer'
import Panelram from './Panelram'
import Produktlista from './Produktlista'

export type Sort = 'ord' | 'mat'

/**
 * Allt som delar en egenskap som inte är gruppen: ett smakord, eller en
 * maträtt de är märkta för.
 *
 * De två är samma vy med olika urval, men de kommer från olika håll.
 * Smakorden är utplockade ur Systembolagets smaktexter och är samma ord som
 * bygger kartan — därför ligger träffarna alltid samlade. Matmärkningen är
 * Systembolagets egen bedömning och har inget med kartan att göra: "fisk"
 * råkar samla sig i det ljusa hörnet, "sällskapsdryck" ligger överallt.
 * Noten säger var siffrorna kommer ifrån, så att det andra fallet inte ser
 * ut som ett fel.
 */
export default function Urval({
  karta,
  sort,
  värde,
  produkter,
  onVäljProdukt,
  onMarkera,
  onStäng,
}: {
  karta: Karta
  sort: Sort
  värde: string
  produkter: Produkt[]
  onVäljProdukt: (p: Produkt) => void
  onMarkera: (p: Produkt | null) => void
  onStäng: () => void
}) {
  const träffar = useMemo(
    () => produkter.filter((p) => (sort === 'ord' ? p.termer : p.mat).includes(värde)),
    [produkter, sort, värde],
  )

  /* Vilka grupper egenskapen hör hemma i. Ett ord som "kavring" samlas i
     porter och stout; "grapefrukt" ligger i IPA-hörnet. Fördelningen säger
     något om ordet i sig. */
  const grupper = useMemo(() => {
    const c = new Map<string, number>()
    for (const p of träffar) for (const g of p.grupper) c.set(g, (c.get(g) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [träffar])

  return (
    <Panelram onStäng={onStäng}>
      <p className="meta">{sort === 'ord' ? 'smakord' : 'passar till'}</p>
      <h2>{sort === 'ord' ? värde : värde.toLowerCase()}</h2>
      <p className="undertitel" data-kik>
        {sort === 'ord'
          ? `${träffar.length} beskrivs med det ordet`
          : `${träffar.length} är märkta för det`}
      </p>
      {sort === 'mat' && (
        <p className="källnot">
          Systembolagets egen matchning. Den bygger inte på smaktexten, så den behöver inte följa
          kartan.
        </p>
      )}

      {grupper.length > 0 && (
        <>
          <h3>Vanligast i</h3>
          <ul className="termer">
            {grupper.map(([namn, n]) => (
              <li key={namn}>
                {namn} · {n}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Träffarna</h3>
      <Produktlista
        karta={karta}
        produkter={träffar}
        onVälj={onVäljProdukt}
        onMarkera={onMarkera}
      />
    </Panelram>
  )
}
