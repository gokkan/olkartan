import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Karta, { type KartHandtag } from './Karta'
import Panel from './Panel'
import Urval from './Urval'
import Sok from './Sok'
import Kartval from './Kartval'
import Fangare from './Fangare'
import kartorData from './data/kartor.json'
import { useProdukter } from './lib/hämtaProdukter'
import { läsLäge, skrivLäge, type Läge } from './lib/lank'
import type { Karta as KartaTyp, Produkt, Grupp } from './lib/typer'

const kartor = kartorData as unknown as KartaTyp[]

export default function App() {
  const hanterare = useRef<KartHandtag>(null)

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

  const karta = useMemo(() => kartor.find((k) => k.id === läge.karta) ?? kartor[0], [läge.karta])
  const { produkter, fel } = useProdukter(karta.id)
  const gruppPerNamn = useMemo(() => new Map(karta.grupper.map((g) => [g.namn, g])), [karta])

  const produkt = useMemo(
    () =>
      läge.produkt && produkter ? (produkter.find((p) => p.id === läge.produkt) ?? null) : null,
    [läge.produkt, produkter],
  )

  /* En länk till en produkt behöver inte bära gruppen med sig — den framgår
     av produkten. Har den flera druvor väljs den första. */
  const grupp = useMemo(() => {
    const namn = läge.grupp ?? produkt?.grupper[0]
    return namn ? (gruppPerNamn.get(namn) ?? null) : null
  }, [läge.grupp, produkt, gruppPerNamn])

  /* Vad som ska ligga som ett moln av enskilda produkter ovanpå grupperna. Ett
     smakord och en maträtt utesluter gruppen: de plockar produkter tvärs över
     kartan, och att samtidigt lysa upp en grupp vore två svar på en fråga. */
  const urval: { sort: 'ord' | 'mat'; värde: string } | null = läge.ord
    ? { sort: 'ord', värde: läge.ord }
    : läge.mat
      ? { sort: 'mat', värde: läge.mat }
      : null

  const molnet = useMemo(() => {
    if (!produkter) return []
    if (läge.ord) return produkter.filter((p) => p.termer.includes(läge.ord!))
    if (läge.mat) return produkter.filter((p) => p.mat.includes(läge.mat!))
    if (grupp) return produkter.filter((p) => p.grupper.includes(grupp.namn))
    return []
  }, [produkter, läge.ord, läge.mat, grupp])

  /** Kartans id följer alltid med, utom för den första — den är standard. */
  const bas = (): Läge => (karta.id === kartor[0].id ? {} : { karta: karta.id })

  /* Kartan äger sin zoom och position och tappar dem inte när man klickar sig
     runt. Sökningen är undantaget: där är förflyttningen hela poängen. */
  const väljGrupp = (g: Grupp) => gåTill({ ...bas(), grupp: g.namn })

  /** Hör produkten hemma i det urval man just nu tittar på? */
  const iUrvalet = (p: Produkt) =>
    läge.ord ? p.termer.includes(läge.ord) : läge.mat ? p.mat.includes(läge.mat) : false

  /* Ett klick i "liknande" landar ofta i en annan grupp — det är poängen med
     att räkna avstånd i smakrymden. Byter produkten grupp flyger vyn dit; inom
     samma grupp rör sig ingenting, för där finns inget nytt att visa.

     Kommer man från ett smakord eller en maträtt behålls det urvalet så länge
     produkten ingår i det: molnet ska fortsätta visa "fisk" medan man bläddrar
     bland fiskvinerna, och tillbakalänken peka dit. Följer man därifrån något
     som inte är märkt för fisk har man lämnat urvalet, och då är gruppen den
     ärliga ramen. */
  const väljProdukt = (p: Produkt) => {
    if (urval && iUrvalet(p)) {
      gåTill({ ...läge, produkt: p.id })
      return
    }
    const bytteGrupp = !p.grupper.includes(läge.grupp ?? '')
    gåTill({ ...bas(), grupp: p.grupper[0], produkt: p.id })
    if (bytteGrupp) hanterare.current?.flygTill(p.x, p.y)
  }

  const väljOrd = (ord: string) => gåTill({ ...bas(), ord })
  const väljMat = (mat: string) => gåTill({ ...bas(), mat })
  const väljKarta = (id: string) => gåTill(id === kartor[0].id ? {} : { karta: id })

  const stäng = () => gåTill(bas())

  return (
    <main>
      <div className="scen">
        <Karta
          ref={hanterare}
          karta={karta}
          vald={urval ? null : (grupp?.namn ?? null)}
          molnet={molnet}
          valdProdukt={produkt}
          onVälj={väljGrupp}
          onVäljProdukt={väljProdukt}
        />

        <div className="reglage">
          <Fangare namn="Sökrutan">
            <Sok
              karta={karta}
              produkter={produkter}
              onVäljProdukt={(p) => {
                väljProdukt(p)
                hanterare.current?.flygTill(p.x, p.y, 4.5)
              }}
              onVäljGrupp={(g) => {
                väljGrupp(g)
                hanterare.current?.flygTill(g.x, g.y, 2.4)
              }}
              onVäljOrd={väljOrd}
              onVäljMat={väljMat}
            />
          </Fangare>
          <Kartval kartor={kartor} vald={karta} onVälj={väljKarta} />
        </div>

        {/* Produkten tar över panelen även när man kom via ett smakord eller en
            maträtt — annars går listan inte att klicka sig in i. Urvalet
            ligger kvar i adressen, och tillbakalänken går dit. */}
        {urval && produkter && !produkt && (
          <Fangare namn="Urvalsvyn">
            <Urval
              karta={karta}
              sort={urval.sort}
              värde={urval.värde}
              produkter={produkter}
              onVäljProdukt={väljProdukt}
              onStäng={stäng}
            />
          </Fangare>
        )}

        {grupp && (produkt || !urval) && (
          <Fangare namn="Panelen">
            <Panel
              karta={karta}
              grupp={grupp}
              produkter={produkter}
              fel={fel}
              vald={produkt}
              tillbaka={urval ? urval.värde.toLowerCase() : grupp.namn}
              onVäljGrupp={väljGrupp}
              onVäljProdukt={väljProdukt}
              onVäljMat={väljMat}
              onTillbaka={() => gåTill({ ...läge, produkt: undefined }, false)}
              onStäng={stäng}
              onVisaMolnet={() => {
                if (molnet.length) hanterare.current?.rymPunkter(molnet)
              }}
            />
          </Fangare>
        )}
      </div>
      <footer>
        <span>{karta.sida}</span>
        <span>
          {karta.antalGrupper} {karta.grupp.flera}, {karta.antalProdukter.toLocaleString('sv-SE')}{' '}
          {karta.enhet.flera}
        </span>
        <span>avstånd är smaklikhet · klicka på {karta.grupp.obestämd}, rulla för att zooma</span>
      </footer>
    </main>
  )
}
