import { useMemo } from 'react'
import type { Produkt, Stil } from './lib/typer'
import {
  AXLAR,
  bryggeriRad,
  heltNamn,
  kr,
  kronor,
  närmasteStilar,
  produkterIStil,
  typiskMat,
} from './lib/urval'
import { srm, srmStapel } from './lib/färg'
import Panelram from './Panelram'
import Etikett from './Etikett'
import { liknande, type Ordfrekvens } from './lib/likhet'

type Props = {
  stil: Stil
  stilar: Stil[]
  produkter: Produkt[] | null
  fel: string | null
  vald: Produkt | null
  ordfrekvens: Ordfrekvens
  /** Vad tillbakalänken i produktvyn heter. Stilens namn i vanliga fall, men
   *  smakordet eller maträtten om det är därifrån man kom. */
  tillbaka: string
  onVäljStil: (s: Stil) => void
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
 * medianen är 6, 6 och 2, alltså samma tre lägen på varje kort man öppnar, och
 * 43 av 60 stilar ligger inom ett klocksteg från den. Strecket satt i praktiken
 * ovanpå stapeländen och sa ingenting. Kvar är `markör`, som bara produktvyn
 * använder — där svarar den på en riktig fråga: är den här ölen beskare än en
 * typisk stout?
 */
function Staplar({
  värden,
  färg,
  markör,
}: {
  värden: Record<string, number>
  färg: string
  markör?: Record<string, number>
}) {
  return (
    <div className="staplar">
      {AXLAR.map(({ nyckel, etikett, max }) => {
        const v = värden[nyckel]
        return (
          <div key={nyckel} className="stapel">
            <span className="stapel-namn">{etikett}</span>
            <div className="stapel-spår">
              <div
                className="stapel-fyll"
                style={{ width: `${(v / max) * 100}%`, background: färg }}
              />
              {markör !== undefined && (
                <div
                  className="stapel-markör"
                  style={{ left: `${(markör[nyckel] / max) * 100}%` }}
                />
              )}
            </div>
            <span className="stapel-tal">{v}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function Panel({
  stil,
  stilar,
  produkter,
  fel,
  vald,
  ordfrekvens,
  tillbaka,
  onVäljStil,
  onVäljProdukt,
  onVäljMat,
  onTillbaka,
  onStäng,
  onVisaMolnet,
}: Props) {
  const lista = useMemo(() => (produkter ? produkterIStil(produkter, stil) : []), [produkter, stil])
  const grannar = useMemo(() => närmasteStilar(stilar, stil), [stilar, stil])
  /* Appens kärna. Avståndet räknas i hela smakrymden, inte på kartans två
     dimensioner — därför hamnar träffarna ofta i en annan stil än den man
     utgick från, vilket är själva poängen. */
  const liknandeÖl = useMemo(
    () => (produkter && vald ? liknande(vald, produkter, ordfrekvens, 6) : []),
    [produkter, vald, ordfrekvens],
  )
  const maten = useMemo(() => (produkter ? typiskMat(lista, produkter) : []), [lista, produkter])
  const färg = srmStapel(stil.mörkhet)

  const stilVärden = { beska: stil.beska, fyllighet: stil.fyllighet, sötma: stil.sötma }

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
              <p className="meta">{bryggeriRad(vald)}</p>
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

          <h3>
            Smakprofil <span className="not">mot stilens median</span>
          </h3>
          <Staplar
            värden={{ beska: vald.beska, fyllighet: vald.fyllighet, sötma: vald.sötma }}
            markör={stilVärden}
            färg={srmStapel(vald.mörkhet)}
          />
          <p className="teckenförklaring">
            <span className="prick markör" /> {stil.namn}
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
            Liknande öl <span className="not">och hur de skiljer sig</span>
          </h3>
          {!produkter && !fel && <p className="laddar">hämtar produkter …</p>}
          <ul className="liknande">
            {liknandeÖl.map((t) => (
              <li key={t.produkt.id}>
                <button onClick={() => onVäljProdukt(t.produkt)}>
                  <span className="l-prick" style={{ background: srm(t.produkt.mörkhet) }} />
                  <span className="l-namn">{heltNamn(t.produkt)}</span>
                  <span className="l-stil">{t.produkt.stil}</span>
                  <span className="l-förklaring">{t.förklaring}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        /* --------------------------------------------------------- stilvy -- */
        <>
          <p className="meta">{stil.förälder}</p>
          <h2>{stil.namn}</h2>
          <p className="undertitel" data-kik>
            {lista.length} öl · {stil.abv} % · {kr(stil.prisPerLiter)}
          </p>
          {lista.length > 1 && (
            <button className="visa-molnet" onClick={onVisaMolnet}>
              Rama in alla {lista.length} på kartan
            </button>
          )}

          <h3>
            Smakprofil <span className="not">stilens median</span>
          </h3>
          <Staplar värden={stilVärden} färg={färg} />

          {stil.kännetecken.length > 0 && (
            <>
              <h3>Kännetecken</h3>
              <ul className="termer">
                {stil.kännetecken.map((t) => (
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
            Mest typiska ölen <span className="not">närmast stilens mitt</span>
          </h3>
          {fel && <p className="fel">{fel}</p>}
          {!produkter && !fel && <p className="laddar">hämtar produkter …</p>}
          <ol className="produkter">
            {lista.map((p) => (
              <li key={p.id}>
                <button onClick={() => onVäljProdukt(p)}>
                  <span className="p-namn">{heltNamn(p)}</span>
                  <span className="p-meta">{bryggeriRad(p)}</span>
                  <span className="p-tal">
                    {p.abv} % · {kr(p.prisPerLiter)}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <h3>Närmaste stilar</h3>
          <ul className="grannar">
            {grannar.map((s) => (
              <li key={s.namn}>
                <button onClick={() => onVäljStil(s)}>
                  <span className="g-prick" style={{ background: srm(s.mörkhet) }} />
                  <span>{s.namn}</span>
                  <span className="g-antal">{s.antal}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panelram>
  )
}
