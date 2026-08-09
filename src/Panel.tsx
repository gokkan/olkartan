import { useMemo } from 'react'
import type { Grupp, Karta, Produkt } from './lib/typer'
import {
  grupprad,
  heltNamn,
  klockvärden,
  kr,
  kronor,
  närmasteGrupper,
  producentRad,
  produkterIGrupp,
  typiskMat,
} from './lib/urval'
import { palett } from './lib/färg'
import Panelram from './Panelram'
import Etikett from './Etikett'
import { liknande } from './lib/likhet'

type Props = {
  karta: Karta
  grupp: Grupp
  produkter: Produkt[] | null
  fel: string | null
  vald: Produkt | null
  /** Vad tillbakalänken i produktvyn heter. Gruppens namn i vanliga fall, men
   *  smakordet eller maträtten om det är därifrån man kom. */
  tillbaka: string
  onVäljGrupp: (g: Grupp) => void
  onVäljProdukt: (p: Produkt) => void
  onVäljMat: (mat: string) => void
  onTillbaka: () => void
  onStäng: () => void
  onVisaMolnet: () => void
}

/**
 * Tre vågräta staplar, inte ett radardiagram. Ett radardiagram med tre hörn är
 * en triangel och ser trasigt ut.
 *
 * Här stod tidigare också ett streck för hela sortimentets median. Det ströks:
 * medianen är samma tre lägen på varje kort man öppnar, och de flesta grupper
 * ligger inom ett klocksteg från den. Strecket satt i praktiken ovanpå
 * stapeländen och sa ingenting. Kvar är `markör`, som bara produktvyn
 * använder — där svarar den på en riktig fråga: är den här ölen beskare än en
 * typisk stout?
 */
function Staplar({
  karta,
  värden,
  färg,
  markör,
}: {
  karta: Karta
  värden: Record<string, number>
  färg: string
  markör?: Record<string, number>
}) {
  return (
    <div className="staplar">
      {klockvärden(karta, värden).map(({ nyckel, etikett, max, värde }) => (
        <div key={nyckel} className="stapel">
          <span className="stapel-namn">{etikett}</span>
          <div className="stapel-spår">
            <div
              className="stapel-fyll"
              style={{ width: `${(värde / max) * 100}%`, background: färg }}
            />
            {markör !== undefined && (
              <div
                className="stapel-markör"
                style={{ left: `${((markör[nyckel] ?? 0) / max) * 100}%` }}
              />
            )}
          </div>
          <span className="stapel-tal">{värde}</span>
        </div>
      ))}
    </div>
  )
}

export default function Panel({
  karta,
  grupp,
  produkter,
  fel,
  vald,
  tillbaka,
  onVäljGrupp,
  onVäljProdukt,
  onVäljMat,
  onTillbaka,
  onStäng,
  onVisaMolnet,
}: Props) {
  const kulör = palett(karta.färgskala)
  const lista = useMemo(
    () => (produkter ? produkterIGrupp(produkter, grupp) : []),
    [produkter, grupp],
  )
  const grannar = useMemo(() => närmasteGrupper(karta.grupper, grupp), [karta, grupp])
  /* Appens kärna. Avståndet räknas i hela smakrymden, inte på kartans två
     dimensioner — därför hamnar träffarna ofta i en annan grupp än den man
     utgick från, vilket är själva poängen. */
  const liknandeProdukter = useMemo(
    () => (produkter && vald ? liknande(vald, produkter, karta.ordfrekvens, karta.klockor, 6) : []),
    [produkter, vald, karta],
  )
  const maten = useMemo(() => (produkter ? typiskMat(lista, produkter) : []), [lista, produkter])

  return (
    <Panelram onStäng={onStäng}>
      {vald ? (
        /* ------------------------------------------------------ produktvy -- */
        <>
          <button className="tillbaka" onClick={onTillbaka}>
            ← {tillbaka}
          </button>
          {/* data-kik: så långt kortet öppnas på telefon vid första trycket. */}
          <div className="produkthuvud" data-kik>
            <div>
              <h2>{heltNamn(vald)}</h2>
              <p className="meta">{producentRad(vald)}</p>
            </div>
            <Etikett produkt={vald} />
          </div>

          <dl className="fakta">
            <div>
              <dt>alkohol</dt>
              <dd>{vald.abv} %</dd>
            </div>
            <div>
              <dt>volym</dt>
              <dd>{vald.volym} ml</dd>
            </div>
            <div>
              <dt>pris</dt>
              <dd>{kronor(vald.pris)}</dd>
            </div>
            <div>
              <dt>jämförpris</dt>
              <dd>{kr(vald.prisPerLiter)}</dd>
            </div>
            <div>
              <dt>sortiment</dt>
              <dd>{vald.sortiment}</dd>
            </div>
            {vald.fatlagrad && (
              <div>
                <dt>fat</dt>
                <dd>fatlagrad</dd>
              </div>
            )}
          </dl>

          {vald.grupper.length > 1 && (
            <>
              <h3>{karta.grupp.flera}</h3>
              <ul className="termer">
                {vald.grupper.map((g) => {
                  const träff = karta.grupper.find((x) => x.namn === g)
                  return (
                    <li key={g}>
                      <button
                        className="term-knapp"
                        onClick={() => träff && onVäljGrupp(träff)}
                        disabled={!träff}
                      >
                        {g}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          <h3>
            Smakprofil <span className="not">mot {karta.grupp.denna}s median</span>
          </h3>
          <Staplar
            karta={karta}
            värden={vald.klockor}
            markör={grupp.klockor}
            färg={kulör.stapel(vald.mörkhet)}
          />
          <p className="teckenförklaring">
            <span className="prick markör" /> {grupp.namn}
          </p>

          <h3>Så beskrivs den</h3>
          <p className="smaktext">{vald.smaktext}</p>

          <ul className="termer">
            {vald.termer.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>

          {vald.mat.length > 0 && (
            <>
              <h3>
                Passar till <span className="not">enligt Systembolaget</span>
              </h3>
              <ul className="termer">
                {vald.mat.map((m) => (
                  <li key={m}>
                    <button className="term-knapp" onClick={() => onVäljMat(m)}>
                      {m.toLowerCase()}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3>
            Liknande <span className="not">och hur de skiljer sig</span>
          </h3>
          {!produkter && !fel && <p className="laddar">hämtar produkter …</p>}
          <ul className="liknande">
            {liknandeProdukter.map((t) => (
              <li key={t.produkt.id}>
                <button onClick={() => onVäljProdukt(t.produkt)}>
                  <span
                    className="l-prick"
                    style={{ background: kulör.fyllning(t.produkt.mörkhet) }}
                  />
                  <span className="l-namn">{heltNamn(t.produkt)}</span>
                  <span className="l-stil">{grupprad(t.produkt)}</span>
                  <span className="l-förklaring">{t.förklaring}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        /* --------------------------------------------------------- gruppvy -- */
        <>
          <p className="meta">{grupp.förälder}</p>
          <h2>{grupp.namn}</h2>
          <p className="undertitel" data-kik>
            {lista.length || grupp.antal} st · {grupp.abv} % · {kr(grupp.prisPerLiter)}
          </p>
          {lista.length > 1 && (
            <button className="visa-molnet" onClick={onVisaMolnet}>
              Rama in alla {lista.length} på kartan
            </button>
          )}

          <h3>
            Smakprofil <span className="not">{karta.grupp.denna}s median</span>
          </h3>
          <Staplar karta={karta} värden={grupp.klockor} färg={kulör.stapel(grupp.mörkhet)} />

          {grupp.kännetecken.length > 0 && (
            <>
              <h3>Kännetecken</h3>
              <ul className="termer">
                {grupp.kännetecken.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}

          {maten.length > 0 && (
            <>
              <h3>
                Passar oftare än andra till <span className="not">enligt Systembolaget</span>
              </h3>
              <ul className="termer">
                {maten.map((m) => (
                  <li key={m}>
                    <button className="term-knapp" onClick={() => onVäljMat(m)}>
                      {m.toLowerCase()}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3>
            Mest typiska <span className="not">närmast {karta.grupp.denna}s mitt</span>
          </h3>
          {fel && <p className="fel">{fel}</p>}
          {!produkter && !fel && <p className="laddar">hämtar produkter …</p>}
          <ol className="produkter">
            {lista.map((p) => (
              <li key={p.id}>
                <button onClick={() => onVäljProdukt(p)}>
                  <span className="p-namn">{heltNamn(p)}</span>
                  <span className="p-meta">{producentRad(p)}</span>
                  <span className="p-tal">
                    {p.abv} % · {kr(p.prisPerLiter)}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <h3>Närmaste {karta.grupp.flera}</h3>
          <ul className="grannar">
            {grannar.map((g) => (
              <li key={g.namn}>
                <button onClick={() => onVäljGrupp(g)}>
                  <span className="g-prick" style={{ background: kulör.fyllning(g.mörkhet) }} />
                  <span>{g.namn}</span>
                  <span className="g-antal">{g.antal}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panelram>
  )
}
