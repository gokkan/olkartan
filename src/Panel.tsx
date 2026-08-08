import { useMemo } from 'react'
import type { Produkt, Stil } from './lib/typer'
import { AXLAR, bryggeriRad, heltNamn, kr, kronor, närmasteStilar, produkterIStil, sortimentetsMedian } from './lib/urval'
import { srm } from './lib/färg'

type Props = {
  stil: Stil
  stilar: Stil[]
  produkter: Produkt[] | null
  fel: string | null
  vald: Produkt | null
  onVäljStil: (s: Stil) => void
  onVäljProdukt: (p: Produkt | null) => void
  onStäng: () => void
}

/**
 * Tre vågräta staplar, inte ett radardiagram. Ett radardiagram med tre hörn är
 * en triangel och ser trasigt ut. Strecket markerar sortimentets median, så att
 * man ser om stilen ligger över eller under snittet och inte bara ett tal.
 */
function Staplar({
  värden,
  referens,
  färg,
  jämför,
}: {
  värden: Record<string, number>
  referens: Record<string, number>
  färg: string
  jämför?: Record<string, number>
}) {
  return (
    <div className="staplar">
      {AXLAR.map(({ nyckel, etikett, max }) => {
        const v = värden[nyckel]
        return (
          <div key={nyckel} className="stapel">
            <span className="stapel-namn">{etikett}</span>
            <div className="stapel-spår">
              <div className="stapel-fyll" style={{ width: `${(v / max) * 100}%`, background: färg }} />
              <div className="stapel-median" style={{ left: `${(referens[nyckel] / max) * 100}%` }} />
              {jämför !== undefined && (
                <div className="stapel-jämför" style={{ left: `${(jämför[nyckel] / max) * 100}%` }} />
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
  onVäljStil,
  onVäljProdukt,
  onStäng,
}: Props) {
  const median = useMemo(() => (produkter ? sortimentetsMedian(produkter) : null), [produkter])
  const lista = useMemo(() => (produkter ? produkterIStil(produkter, stil) : []), [produkter, stil])
  const grannar = useMemo(() => närmasteStilar(stilar, stil), [stilar, stil])
  const färg = srm(stil.mörkhet)

  const stilVärden = { beska: stil.beska, fyllighet: stil.fyllighet, sötma: stil.sötma }

  return (
    <aside className="panel">
      <button className="stäng" onClick={onStäng} aria-label="Stäng panelen">
        ×
      </button>

      {vald ? (
        /* ------------------------------------------------------ produktvy -- */
        <>
          <button className="tillbaka" onClick={() => onVäljProdukt(null)}>
            ← {stil.namn}
          </button>
          <h2>{heltNamn(vald)}</h2>
          <p className="meta">{bryggeriRad(vald)}</p>

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

          {median && (
            <>
              <h3>
                Smakprofil <span className="not">mot stilens median</span>
              </h3>
              <Staplar
                värden={{ beska: vald.beska, fyllighet: vald.fyllighet, sötma: vald.sötma }}
                referens={median}
                jämför={stilVärden}
                färg={srm(vald.mörkhet)}
              />
              <p className="teckenförklaring">
                <span className="prick median" /> sortimentets median
                <span className="prick jämför" /> {stil.namn}
              </p>
            </>
          )}

          <h3>Så beskrivs den</h3>
          <p className="smaktext">{vald.smaktext}</p>

          <ul className="termer">
            {vald.termer.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      ) : (
        /* --------------------------------------------------------- stilvy -- */
        <>
          <p className="meta">{stil.förälder}</p>
          <h2>{stil.namn}</h2>
          <p className="undertitel">
            {stil.antal} öl · {stil.abv} % · {kr(stil.prisPerLiter)}
          </p>

          {median && (
            <>
              <h3>
                Smakprofil <span className="not">median, mot hela sortimentet</span>
              </h3>
              <Staplar värden={stilVärden} referens={median} färg={färg} />
            </>
          )}

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
    </aside>
  )
}
