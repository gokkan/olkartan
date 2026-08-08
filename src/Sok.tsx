import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Produkt, Stil } from './lib/typer'
import { bryggeriRad, heltNamn } from './lib/urval'
import { srm } from './lib/färg'

const MAX_TRÄFFAR = 40

/** Förlåtande jämförelse: gemener, och å/ä/ö matchar a/a/o. Den som söker
 *  "sot porter" ska hitta "Söt porter och stout". */
const nyckla = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

type Träff =
  | { typ: 'stil'; stil: Stil; rang: number; sortnamn: string }
  | { typ: 'produkt'; produkt: Produkt; rang: number; sortnamn: string }

/** Var i en text frågan träffar avgör hur högt träffen hamnar. */
function rangera(text: string, q: string) {
  if (text.startsWith(q)) return 0
  if (text.includes(' ' + q)) return 1
  if (text.includes(q)) return 2
  return -1
}

export default function Sok({
  produkter,
  stilar,
  onVäljProdukt,
  onVäljStil,
}: {
  produkter: Produkt[] | null
  stilar: Stil[]
  onVäljProdukt: (p: Produkt) => void
  onVäljStil: (s: Stil) => void
}) {
  const [fråga, setFråga] = useState('')
  const [markerad, setMarkerad] = useState(0)
  const [öppen, setÖppen] = useState(false)
  const fältet = useRef<HTMLInputElement>(null)

  /* Söknycklarna byggs en gång per produktuppsättning, inte per tangenttryck. */
  const produktIndex = useMemo(
    () =>
      (produkter ?? []).map((p) => ({
        produkt: p,
        namn: nyckla(heltNamn(p)),
        bryggeri: nyckla(p.bryggeri ?? ''),
      })),
    [produkter],
  )

  const stilIndex = useMemo(
    () => stilar.map((s) => ({ stil: s, namn: nyckla(s.namn), förälder: nyckla(s.förälder) })),
    [stilar],
  )

  const träffar = useMemo<Träff[]>(() => {
    const q = nyckla(fråga.trim())
    if (q.length < 2) return []
    const ut: Träff[] = []

    // Stilar först. De är bredare ingångar — den som skriver "porter" vill
    // troligen se stilen, inte de tre ölen som råkar heta så.
    for (const rad of stilIndex) {
      const r = rangera(rad.namn, q)
      const träff = r >= 0 ? r : rad.förälder.includes(q) ? 3 : -1
      if (träff >= 0) ut.push({ typ: 'stil', stil: rad.stil, rang: träff, sortnamn: rad.stil.namn })
    }
    ut.sort((a, b) => a.rang - b.rang || a.sortnamn.localeCompare(b.sortnamn, 'sv'))

    const produktTräffar: Träff[] = []
    for (const rad of produktIndex) {
      const r = rangera(rad.namn, q)
      const träff = r >= 0 ? r : rad.bryggeri.includes(q) ? 3 : -1
      if (träff >= 0)
        produktTräffar.push({
          typ: 'produkt',
          produkt: rad.produkt,
          rang: träff,
          sortnamn: heltNamn(rad.produkt),
        })
    }
    produktTräffar.sort((a, b) => a.rang - b.rang || a.sortnamn.localeCompare(b.sortnamn, 'sv'))

    return [...ut, ...produktTräffar].slice(0, MAX_TRÄFFAR)
  }, [fråga, produktIndex, stilIndex])

  function välj(t: Träff) {
    if (t.typ === 'stil') onVäljStil(t.stil)
    else onVäljProdukt(t.produkt)
    setÖppen(false)
    fältet.current?.blur()
  }

  function tangent(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setFråga('')
      setÖppen(false)
      fältet.current?.blur()
      return
    }
    if (!träffar.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMarkerad((i) => (i + 1) % träffar.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMarkerad((i) => (i - 1 + träffar.length) % träffar.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      välj(träffar[Math.min(markerad, träffar.length - 1)])
    }
  }

  const visaLista = öppen && fråga.trim().length >= 2

  return (
    <div className="sok">
      <input
        ref={fältet}
        type="search"
        value={fråga}
        placeholder={
          produkter
            ? `Sök bland ${produkter.length.toLocaleString('sv-SE')} öl och 60 stilar`
            : 'Sök stil eller öl'
        }
        onChange={(e) => {
          setFråga(e.target.value)
          setMarkerad(0)
          setÖppen(true)
        }}
        onFocus={() => setÖppen(true)}
        onKeyDown={tangent}
        aria-label="Sök efter öl, bryggeri eller stil"
      />

      {visaLista && (
        <ul className="sok-traffar">
          {träffar.length === 0 && <li className="sok-tomt">Inget matchar</li>}
          {träffar.map((t, i) => {
            const nyckel = t.typ === 'stil' ? 'S' + t.stil.namn : 'P' + t.produkt.id
            const mörkhet = t.typ === 'stil' ? t.stil.mörkhet : t.produkt.mörkhet
            return (
              <li key={nyckel}>
                <button
                  className={i === markerad ? 'markerad' : undefined}
                  // onMouseDown hinner före input-fältets blur, som annars
                  // stänger listan innan klicket landar.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    välj(t)
                  }}
                  onMouseEnter={() => setMarkerad(i)}
                >
                  <span className="sok-prick" style={{ background: srm(mörkhet) }} />
                  {t.typ === 'stil' ? (
                    <>
                      <span className="sok-namn">{t.stil.namn}</span>
                      <span className="sok-stil">stil</span>
                      <span className="sok-meta">
                        {t.stil.förälder} · {t.stil.antal} öl
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="sok-namn">{heltNamn(t.produkt)}</span>
                      <span className="sok-stil">{t.produkt.stil}</span>
                      <span className="sok-meta">{bryggeriRad(t.produkt)}</span>
                    </>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
