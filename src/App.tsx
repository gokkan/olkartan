import { useMemo, useState } from 'react'
import Karta from './Karta'
import Panel from './Panel'
import Sok from './Sok'
import Fangare from './Fangare'
import stilarData from './data/stilar.json'
import metaData from './data/meta.json'
import { useProdukter } from './lib/hämtaProdukter'
import type { Meta, Produkt, Stil } from './lib/typer'

const stilar = stilarData as Stil[]
const meta = metaData as Meta

export default function App() {
  const { produkter, fel } = useProdukter()
  const [stil, setStil] = useState<Stil | null>(null)
  const [produkt, setProdukt] = useState<Produkt | null>(null)

  /* Kartan ligger kvar monterad hela tiden och äger sin egen zoom och position.
     Därför överlever de att man klickar sig fram och tillbaka mellan stilar och
     produkter — det är acceptanskriteriet för den här fasen. */
  function väljStil(s: Stil) {
    setStil(s)
    setProdukt(null)
  }

  const stilPerNamn = useMemo(() => new Map(stilar.map((s) => [s.namn, s])), [])

  /* En sökträff öppnar ölens egen vy och markerar samtidigt dess stil på
     kartan, så att man ser var i smakrymden man hamnade. */
  function väljProdukt(p: Produkt) {
    const s = stilPerNamn.get(p.stil)
    if (s) setStil(s)
    setProdukt(p)
  }

  return (
    <main className={stil ? 'med-panel' : undefined}>
      <div className="scen">
        <Karta stilar={stilar} meta={meta} vald={stil?.namn ?? null} onVälj={väljStil} />
        <Fangare namn="Sökrutan">
          <Sok
            produkter={produkter}
            stilar={stilar}
            onVäljProdukt={väljProdukt}
            onVäljStil={väljStil}
          />
        </Fangare>
        {stil && (
          <Fangare namn="Panelen">
            <Panel
              stil={stil}
              stilar={stilar}
              produkter={produkter}
              fel={fel}
              vald={produkt}
              onVäljStil={väljStil}
              onVäljProdukt={setProdukt}
              onStäng={() => {
                setStil(null)
                setProdukt(null)
              }}
            />
          </Fangare>
        )}
      </div>
      <footer>
        <span>ölkartan</span>
        <span>
          {meta.antalStilar} stilar, {meta.antalProdukter.toLocaleString('sv-SE')} öl
        </span>
        <span>avstånd är smaklikhet · klicka på en stil, rulla för att zooma</span>
      </footer>
    </main>
  )
}
