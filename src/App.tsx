import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Karta, { type KartHandtag } from './Karta'
import Panel from './Panel'
import Urval from './Urval'
import Sok from './Sok'
import Kartval from './Kartval'
import Karta3D from './Karta3D'
import Om from './Om'
import Fangare from './Fangare'
import kartorData from './data/kartor.json'
import { useProdukter } from './lib/hämtaProdukter'
import { läsLäge, skrivLäge, type Läge } from './lib/lank'
import { KLOCKSKALA } from './lib/färg'
import type { Karta as KartaTyp, Produkt, Grupp } from './lib/typer'

const kartor = kartorData as unknown as KartaTyp[]

export default function App() {
  const hanterare = useRef<KartHandtag>(null)

  /* Reglagets höjd, mätt och skickad vidare som CSS-variabel.
   *
   * På telefon är reglaget nästan skärmbrett och ligger rakt över uppåtpilens
   * axelord. Etiketten sköts därför ned under det — men "hur långt ned" stod
   * som ett handsatt tal i css:en, och gick sönder båda gångerna reglaget
   * växte: först när kartvalet kom, sedan när färgvalet kom. Nu mäts det. */
  const reglaget = useRef<HTMLDivElement>(null)
  const [reglagehöjd, setReglagehöjd] = useState(82)
  useEffect(() => {
    const el = reglaget.current
    if (!el) return
    const mät = () => setReglagehöjd(Math.round(el.getBoundingClientRect().height))
    mät()
    const ro = new ResizeObserver(mät)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
     av produkten. Har den flera druvor väljs den första, och har den ingen
     alls blir det ingen grupp: 263 röda viner saknar druva hos Systembolaget
     men ligger ändå på kartan. */
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
    // En produkt utan grupp har inget moln att ingå i. Den ritas ensam, för
    // annars skulle kartan vara tom när man sökt upp den.
    if (produkt) return [produkt]
    return []
  }, [produkter, läge.ord, läge.mat, grupp, produkt])

  /* I 3D-läget går det inte att klicka på något. Det är hela skälet till att
     läget är möjligt: utan träffytor slipper man djupsorterad träffprövning,
     etiketter som flyttar sig varje bildruta och en tredje gest på telefonen.
     Vill man välja något trycker man 2D. */
  const tredje = läge.vy === '3d'

  /* Vad prickarnas färg ska betyda. Normalt hur mörk drycken är — det är
     dryckens eget färgspråk och svarar på "vad är det här". Väljer man en
     klocka svarar färgen i stället på "hur mycket beska", och man ser hur den
     ligger utspridd över kartan. Klockan valideras mot kartan: byter man till
     vitt vin finns ingen beska, och då faller färgen tillbaka. */
  const färgkanal = useMemo(
    () => karta.färgkanaler.find((k) => k.nyckel === läge.farg) ?? null,
    [karta, läge.farg],
  )

  /** Vad som överlever ett klick.
   *
   *  Kartans id, utom för den första — den är standard. Vyläget, så att man
   *  inte kastas ur molnet av att välja en stil. Och färgvalet: har man ställt
   *  om prickarna till beska är det en inställning man gjort för att titta på
   *  kartan, inte en del av det man tittar på. Att den nollställdes vid varje
   *  klick gjorde den nästan oanvändbar. */
  const bas = (): Läge => ({
    ...(karta.id === kartor[0].id ? {} : { karta: karta.id }),
    ...(läge.vy ? { vy: läge.vy } : {}),
    ...(läge.farg ? { farg: läge.farg } : {}),
  })

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
    // Utan grupp finns ingen granne att jämföra med — då är en förflyttning
    // alltid rätt, för det är den enda prick som kommer att synas.
    if (bytteGrupp || !p.grupper.length) hanterare.current?.flygTill(p.x, p.y)
  }

  const väljOrd = (ord: string) => gåTill({ ...bas(), ord })
  const väljMat = (mat: string) => gåTill({ ...bas(), mat })
  /* Om-rutan följer med vid kartbyte. Den beskriver kartan man tittar på, så
     den som läser och byter vill se den andra kartans siffror — inte stänga
     rutan och öppna den igen. */
  const väljKarta = (id: string) => {
    // Färgvalet följer med om den nya kartan har samma kanal. Beska finns inte
    // för vin, och en hash som pekar på något kartan inte har vore en lögn —
    // fyllighet, pris och alkoholhalt finns däremot överallt.
    const ny = kartor.find((k) => k.id === id)
    const farg = ny?.färgkanaler.some((k) => k.nyckel === läge.farg) ? läge.farg : undefined
    gåTill({ ...(id === kartor[0].id ? {} : { karta: id }), om: läge.om, vy: läge.vy, farg })
  }

  const stäng = () => gåTill(bas())

  return (
    <main>
      <div className="scen" style={{ '--reglage': `${reglagehöjd}px` } as CSSProperties}>
        {tredje ? (
          <Karta3D
            karta={karta}
            färgkanal={färgkanal}
            vald={urval ? null : (grupp?.namn ?? null)}
            molnet={molnet}
            valdProdukt={produkt}
          />
        ) : (
          <Karta
            ref={hanterare}
            karta={karta}
            färgkanal={färgkanal}
            vald={urval ? null : (grupp?.namn ?? null)}
            molnet={molnet}
            valdProdukt={produkt}
            onVälj={väljGrupp}
            onVäljProdukt={väljProdukt}
          />
        )}

        <div className="reglage" ref={reglaget}>
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
          <div className="reglage-rad">
            <Kartval kartor={kartor} vald={karta} onVälj={väljKarta} />
            {/* 3D-läget är parkerat: knappen som tog en dit är borttagen, men
                `#vy=3d` fungerar och gränssnittstestet kör det. Ett läge som
                bara ligger kvar som oanropad kod ruttnar utan att någon märker
                det; ett som går att nå och mäta gör inte det. Vägen ut måste
                däremot finnas, annars sitter den som följt en länk fast. */}
            {tredje && (
              <button
                className="vy-knapp aktiv"
                onClick={() => gåTill({ ...läge, vy: undefined })}
                title="Tillbaka till kartan"
              >
                2D
              </button>
            )}
            <button
              className={`om-knapp${läge.om ? ' aktiv' : ''}`}
              onClick={() => gåTill(läge.om ? { ...läge, om: undefined } : { ...läge, om: '1' })}
              aria-label="Om hur kartan räknas fram"
              aria-pressed={!!läge.om}
              title="Hur kartan räknas fram"
            >
              i
            </button>
          </div>

          {/* Kartan visar var något ligger, men inte hur beskt eller hur dyrt
              det är. Färgen är den enda lediga kanalen: storleken betyder
              antal och platsen betyder smaklikhet.

              Klockorna och det andra står i skilda grupper eftersom de svarar
              på olika sorters frågor. Klockorna är smakprofilen, och
              alkoholhalten är dessutom en av kartans egna ingångar — färgen
              visar där mest hur väl kartan fångat det den matats med. Priset
              ligger helt utanför och är det enda som lägger till något
              positionen omöjligt kan bära. */}
          <label className="fargval">
            <span>färg</span>
            <select
              value={färgkanal?.nyckel ?? ''}
              onChange={(e) => gåTill({ ...läge, farg: e.target.value || undefined })}
            >
              <option value="">{karta.id === 'ol' ? 'ölets färg' : 'vinets färg'}</option>
              <optgroup label="smakprofil">
                {karta.färgkanaler
                  .filter((k) => k.sort === 'klocka')
                  .map((k) => (
                    <option key={k.nyckel} value={k.nyckel}>
                      {k.etikett}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="om flaskan">
                {karta.färgkanaler
                  .filter((k) => k.sort === 'annat')
                  .map((k) => (
                    <option key={k.nyckel} value={k.nyckel}>
                      {k.etikett}
                    </option>
                  ))}
              </optgroup>
            </select>
            {/* Ändarna är där produkterna faktiskt ligger, inte skalans slut —
                annars vore kartan enfärgad. Talen står ut så att ingen tror att
                bandet spänner över allt. */}
            {färgkanal && (
              <span className="fargskala" aria-hidden>
                <span>{färgkanal.spann[0].toLocaleString('sv-SE')}</span>
                <span
                  className="fargband"
                  style={{ background: `linear-gradient(90deg, ${KLOCKSKALA.join(',')})` }}
                />
                <span>
                  {färgkanal.spann[1].toLocaleString('sv-SE')}
                  {färgkanal.enhet}
                </span>
              </span>
            )}
          </label>
        </div>

        {/* Om-rutan tar hela panelplatsen så länge den är öppen. Det man
            tittade på ligger kvar i adressen och kommer tillbaka när man
            stänger — panelen är en plats, inte ett tillstånd. */}
        {läge.om && (
          <Fangare namn="Om-rutan">
            <Om karta={karta} onStäng={() => gåTill({ ...läge, om: undefined })} />
          </Fangare>
        )}

        {/* Produkten tar över panelen även när man kom via ett smakord eller en
            maträtt — annars går listan inte att klicka sig in i. Urvalet
            ligger kvar i adressen, och tillbakalänken går dit. */}
        {!läge.om && urval && produkter && !produkt && (
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

        {!läge.om && (grupp || produkt) && (produkt || !urval) && (
          <Fangare namn="Panelen">
            <Panel
              karta={karta}
              grupp={grupp}
              produkter={produkter}
              fel={fel}
              vald={produkt}
              tillbaka={urval ? urval.värde.toLowerCase() : (grupp?.namn ?? null)}
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
        <span>
          {tredje
            ? `avstånd är smaklikhet · dra för att vrida — tryck 2D för att kunna välja`
            : `avstånd är smaklikhet · klicka på ${karta.grupp.obestämd}, rulla för att zooma`}
        </span>
      </footer>
    </main>
  )
}
