import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Karta, { type KartHandtag } from './Karta'
import Panel from './Panel'
import Smakord from './Smakord'
import Sok from './Sok'
import Fangare from './Fangare'
import stilarData from './data/stilar.json'
import metaData from './data/meta.json'
import { useProdukter } from './lib/hämtaProdukter'
import { läsLäge, skrivLäge, type Läge } from './lib/lank'
import type { Meta, Produkt, Stil } from './lib/typer'

const stilar = stilarData as Stil[]
const meta = metaData as Meta
const stilPerNamn = new Map(stilar.map((s) => [s.namn, s]))

export default function App() {
  const { produkter, fel } = useProdukter()
  const karta = useRef<KartHandtag>(null)

  /* Hela urvalet ligger i adressfältet. Att låta hashen vara sanningen i
     stället för att spegla ett separat tillstånd gör bakåtknappen gratis. */
  const [läge, sättLäge] = useState<Läge>(() => läsLäge())

  useEffect(() => {
    const vid = () => sättLäge(läsLäge())
    addEventListener('hashchange', vid)
    addEventListener('popstate', vid)
    return () => {
      removeEventListener('hashchange', vid)
      removeEventListener('popstate', vid)
    }
  }, [])

  const gåTill = useCallback((nytt: Läge, nyPost = true) => {
    skrivLäge(nytt, nyPost)
    sättLäge(nytt)
  }, [])

  /* Sortimentet är inte tillgängligt på samma sätt: sju av tio öl finns bara
     lokalt eller på beställning. Filtret gäller överallt — sökning, listor,
     liknande öl och prickarnas storlek — så att en rekommendation man inte
     kan handla aldrig dyker upp. */
  const synliga = useMemo(
    () =>
      produkter
        ? läge.fast
          ? produkter.filter((p) => p.sortiment === 'Fast sortiment')
          : produkter
        : null,
    [produkter, läge.fast],
  )

  const antalPerStil = useMemo(() => {
    if (!synliga || !läge.fast) return null
    const c = new Map<string, number>()
    for (const s of stilar) c.set(s.namn, 0)
    for (const p of synliga) c.set(p.stil, (c.get(p.stil) ?? 0) + 1)
    return c
  }, [synliga, läge.fast])

  /* Ölen slås upp i hela sortimentet, inte bland de filtrerade. En delad länk
     ska fungera även för mottagaren som råkar ha filtret påslaget — filtret
     styr vad man bläddrar bland, inte vad man får titta på. */
  const produkt = useMemo(
    () => (läge.öl && produkter ? (produkter.find((p) => p.id === läge.öl) ?? null) : null),
    [läge.öl, produkter],
  )

  /* En länk till en öl behöver inte bära stilen med sig — den framgår av ölen. */
  const stil = useMemo(() => {
    const namn = läge.stil ?? produkt?.stil
    return namn ? (stilPerNamn.get(namn) ?? null) : null
  }, [läge.stil, produkt])

  const molnet = useMemo(() => {
    if (!synliga) return []
    if (läge.ord) return synliga.filter((p) => p.termer.includes(läge.ord!))
    if (stil) return synliga.filter((p) => p.stil === stil.namn)
    return []
  }, [synliga, läge.ord, stil])

  /* Kartan äger sin zoom och position och tappar dem inte när man klickar sig
     runt. Sökningen är undantaget: där är förflyttningen hela poängen. */
  const väljStil = (s: Stil) => gåTill({ ...läge, stil: s.namn, öl: undefined, ord: undefined })

  /* Ett klick i "liknande öl" landar ofta i en annan stil — det är poängen med
     att räkna avstånd i smakrymden. Byter ölen stil flyger vyn dit; inom samma
     stil rör sig ingenting, för där finns inget nytt att visa. */
  const väljProdukt = (p: Produkt) => {
    const bytteStil = !läge.ord && p.stil !== läge.stil
    gåTill({ ...läge, stil: läge.ord ? undefined : p.stil, öl: p.id })
    if (bytteStil) karta.current?.flygTill(p.x, p.y)
  }

  const väljOrd = (ord: string) => gåTill({ ...läge, ord, stil: undefined, öl: undefined })

  const stäng = () => gåTill({ fast: läge.fast })

  return (
    <main>
      <div className="scen">
        <Karta
          ref={karta}
          stilar={stilar}
          meta={meta}
          vald={läge.ord ? null : (stil?.namn ?? null)}
          molnet={molnet}
          antalPerStil={antalPerStil}
          valdProdukt={produkt}
          onVälj={väljStil}
          onVäljProdukt={väljProdukt}
        />

        <div className="reglage">
          <Fangare namn="Sökrutan">
            <Sok
              produkter={synliga}
              stilar={stilar}
              ordfrekvens={meta.ordfrekvens}
              onVäljProdukt={(p) => {
                väljProdukt(p)
                karta.current?.flygTill(p.x, p.y, 4.5)
              }}
              onVäljStil={(s) => {
                väljStil(s)
                karta.current?.flygTill(s.x, s.y, 2.4)
              }}
              onVäljOrd={väljOrd}
            />
          </Fangare>

          <label className="filter">
            <input
              type="checkbox"
              checked={läge.fast === true}
              onChange={(e) => gåTill({ ...läge, fast: e.target.checked || undefined }, false)}
            />
            Bara fast sortiment
            <span>{synliga ? synliga.length.toLocaleString('sv-SE') + ' öl' : '…'}</span>
          </label>
        </div>

        {läge.ord && synliga && (
          <Fangare namn="Smakordsvyn">
            <Smakord
              ord={läge.ord}
              produkter={synliga}
              vald={produkt}
              onVäljProdukt={väljProdukt}
              onStäng={stäng}
            />
          </Fangare>
        )}

        {!läge.ord && stil && (
          <Fangare namn="Panelen">
            <Panel
              stil={stil}
              stilar={stilar}
              produkter={synliga}
              fel={fel}
              vald={produkt}
              ordfrekvens={meta.ordfrekvens}
              onVäljStil={väljStil}
              onVäljProdukt={väljProdukt}
              onTillbaka={() => gåTill({ ...läge, öl: undefined }, false)}
              onStäng={stäng}
              onVisaMolnet={() => {
                if (molnet.length) karta.current?.rymPunkter(molnet)
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
