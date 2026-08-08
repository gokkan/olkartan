import { useMemo, useRef, useState } from 'react'
import Karta, { type KartHandtag } from './Karta'
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
  const karta = useRef<KartHandtag>(null)

  const stilPerNamn = useMemo(() => new Map(stilar.map((s) => [s.namn, s])), [])

  /* Ölen i den valda stilen ritas ut som ett moln på kartan. */
  const stilProdukter = useMemo(
    () => (produkter && stil ? produkter.filter((p) => p.stil === stil.namn) : []),
    [produkter, stil],
  )

  /* Kartan ligger kvar monterad hela tiden och äger sin egen zoom och position.
     Därför överlever de att man klickar sig fram och tillbaka mellan stilar och
     produkter — det är acceptanskriteriet för fas 2. Sökningen är undantaget:
     där är förflyttningen hela poängen, och då flyger vyn dit. */
  function väljStil(s: Stil) {
    setStil(s)
    setProdukt(null)
  }

  /* Ett klick i "liknande öl" landar ofta i en annan stil — det är poängen
     med att räkna avstånd i hela smakrymden i stället för på kartan. Byter
     ölen stil flyger vyn dit, så att man ser var i rymden man hamnade. Håller
     man sig inom samma stil rör sig ingenting; där finns inget att visa. */
  function väljProdukt(p: Produkt) {
    const s = stilPerNamn.get(p.stil)
    const bytteStil = s && s.namn !== stil?.namn
    if (s) setStil(s)
    setProdukt(p)
    if (bytteStil) karta.current?.flygTill(p.x, p.y)
  }

  function sökStil(s: Stil) {
    väljStil(s)
    karta.current?.flygTill(s.x, s.y, 2.4)
  }

  function sökProdukt(p: Produkt) {
    väljProdukt(p)
    karta.current?.flygTill(p.x, p.y, 4.5)
  }

  return (
    <main className={stil ? 'med-panel' : undefined}>
      <div className="scen">
        <Karta
          ref={karta}
          stilar={stilar}
          meta={meta}
          vald={stil?.namn ?? null}
          stilProdukter={stilProdukter}
          valdProdukt={produkt}
          onVälj={väljStil}
          onVäljProdukt={väljProdukt}
        />
        <Fangare namn="Sökrutan">
          <Sok
            produkter={produkter}
            stilar={stilar}
            onVäljProdukt={sökProdukt}
            onVäljStil={sökStil}
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
              ordfrekvens={meta.ordfrekvens}
              onVäljStil={väljStil}
              onVäljProdukt={väljProdukt}
              onTillbaka={() => setProdukt(null)}
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
