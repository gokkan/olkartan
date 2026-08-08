import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Karta, { type KartHandtag } from './Karta'
import Panel from './Panel'
import Urval from './Urval'
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

  const produkt = useMemo(
    () => (läge.öl && produkter ? (produkter.find((p) => p.id === läge.öl) ?? null) : null),
    [läge.öl, produkter],
  )

  /* En länk till en öl behöver inte bära stilen med sig — den framgår av ölen. */
  const stil = useMemo(() => {
    const namn = läge.stil ?? produkt?.stil
    return namn ? (stilPerNamn.get(namn) ?? null) : null
  }, [läge.stil, produkt])

  /* Vad som ska ligga som ett moln av enskilda öl ovanpå stilarna. Ett
     smakord och en maträtt utesluter stilen: de plockar ölen tvärs över
     kartan, och att samtidigt lysa upp en stil vore två svar på en fråga. */
  const urval: { sort: 'ord' | 'mat'; värde: string } | null = läge.ord
    ? { sort: 'ord', värde: läge.ord }
    : läge.mat
      ? { sort: 'mat', värde: läge.mat }
      : null

  const molnet = useMemo(() => {
    if (!produkter) return []
    if (läge.ord) return produkter.filter((p) => p.termer.includes(läge.ord!))
    if (läge.mat) return produkter.filter((p) => p.mat.includes(läge.mat!))
    if (stil) return produkter.filter((p) => p.stil === stil.namn)
    return []
  }, [produkter, läge.ord, läge.mat, stil])

  /* Kartan äger sin zoom och position och tappar dem inte när man klickar sig
     runt. Sökningen är undantaget: där är förflyttningen hela poängen. */
  const väljStil = (s: Stil) => gåTill({ stil: s.namn })

  /* Ett klick i "liknande öl" landar ofta i en annan stil — det är poängen med
     att räkna avstånd i smakrymden. Byter ölen stil flyger vyn dit; inom samma
     stil rör sig ingenting, för där finns inget nytt att visa. */
  const väljProdukt = (p: Produkt) => {
    const bytteStil = !urval && p.stil !== läge.stil
    gåTill({ ...läge, stil: urval ? undefined : p.stil, öl: p.id })
    if (bytteStil) karta.current?.flygTill(p.x, p.y)
  }

  const väljOrd = (ord: string) => gåTill({ ord })
  const väljMat = (mat: string) => gåTill({ mat })

  const stäng = () => gåTill({})

  return (
    <main>
      <div className="scen">
        <Karta
          ref={karta}
          stilar={stilar}
          meta={meta}
          vald={urval ? null : (stil?.namn ?? null)}
          molnet={molnet}
          valdProdukt={produkt}
          onVälj={väljStil}
          onVäljProdukt={väljProdukt}
        />

        <Fangare namn="Sökrutan">
          <Sok
            produkter={produkter}
            stilar={stilar}
            ordfrekvens={meta.ordfrekvens}
            matfrekvens={meta.matfrekvens}
            onVäljProdukt={(p) => {
              väljProdukt(p)
              karta.current?.flygTill(p.x, p.y, 4.5)
            }}
            onVäljStil={(s) => {
              väljStil(s)
              karta.current?.flygTill(s.x, s.y, 2.4)
            }}
            onVäljOrd={väljOrd}
            onVäljMat={väljMat}
          />
        </Fangare>

        {urval && produkter && (
          <Fangare namn="Urvalsvyn">
            <Urval
              sort={urval.sort}
              värde={urval.värde}
              produkter={produkter}
              vald={produkt}
              onVäljProdukt={väljProdukt}
              onStäng={stäng}
            />
          </Fangare>
        )}

        {!urval && stil && (
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
              onVäljMat={väljMat}
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
