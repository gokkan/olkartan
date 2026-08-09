import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Grupp, Karta, Produkt } from './lib/typer'
import { grupprad, heltNamn, producentRad } from './lib/urval'
import { palett } from './lib/färg'

const MAX_TRÄFFAR = 40

/** Förlåtande jämförelse: gemener, och å/ä/ö matchar a/a/o. Den som söker
 *  "sot porter" ska hitta "Söt porter och stout". */
const nyckla = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

type Träff =
  | { typ: 'grupp'; grupp: Grupp; rang: number; sortnamn: string }
  | { typ: 'ord'; ord: string; antal: number; rang: number; sortnamn: string }
  | { typ: 'mat'; mat: string; antal: number; rang: number; sortnamn: string }
  | { typ: 'produkt'; produkt: Produkt; rang: number; sortnamn: string }

/** Var i en text frågan träffar avgör hur högt träffen hamnar. */
function rangera(text: string, q: string) {
  if (text.startsWith(q)) return 0
  if (text.includes(' ' + q)) return 1
  if (text.includes(q)) return 2
  return -1
}

export default function Sok({
  karta,
  produkter,
  onVäljProdukt,
  onVäljGrupp,
  onVäljOrd,
  onVäljMat,
}: {
  karta: Karta
  produkter: Produkt[] | null
  onVäljProdukt: (p: Produkt) => void
  onVäljGrupp: (g: Grupp) => void
  onVäljOrd: (ord: string) => void
  onVäljMat: (mat: string) => void
}) {
  const [fråga, setFråga] = useState('')
  const [markerad, setMarkerad] = useState(0)
  const [öppen, setÖppen] = useState(false)
  const fältet = useRef<HTMLInputElement>(null)
  const kulör = palett(karta.färgskala)

  /* Söknycklarna byggs en gång per produktuppsättning, inte per tangenttryck. */
  const produktIndex = useMemo(
    () =>
      (produkter ?? []).map((p) => ({
        produkt: p,
        namn: nyckla(heltNamn(p)),
        producent: nyckla(p.bryggeri ?? ''),
      })),
    [produkter],
  )

  const gruppIndex = useMemo(
    () =>
      karta.grupper.map((g) => ({ grupp: g, namn: nyckla(g.namn), förälder: nyckla(g.förälder) })),
    [karta],
  )

  /* Smakorden är sökbara i sig. Ord som bara ett par produkter har är oftast
     stavfel i källan och hör inte hemma i en lista man kan klicka på. */
  const ordIndex = useMemo(
    () =>
      Object.entries(karta.ordfrekvens)
        .filter(([, n]) => n >= 5)
        .map(([ord, antal]) => ({ ord, antal, nyckel: nyckla(ord) })),
    [karta],
  )

  /* Maträtterna kommer ur kartans meta och behöver inte vänta på produkterna. */
  const matIndex = useMemo(
    () =>
      Object.entries(karta.matfrekvens).map(([mat, antal]) => ({
        mat,
        antal,
        nyckel: nyckla(mat),
      })),
    [karta],
  )

  const träffar = useMemo<Träff[]>(() => {
    const q = nyckla(fråga.trim())
    if (q.length < 2) return []
    const ut: Träff[] = []

    // Grupperna först. De är bredare ingångar — den som skriver "porter" vill
    // troligen se stilen, inte de tre ölen som råkar heta så.
    for (const rad of gruppIndex) {
      const r = rangera(rad.namn, q)
      const träff = r >= 0 ? r : rad.förälder.includes(q) ? 3 : -1
      if (träff >= 0)
        ut.push({ typ: 'grupp', grupp: rad.grupp, rang: träff, sortnamn: rad.grupp.namn })
    }
    ut.sort((a, b) => a.rang - b.rang || a.sortnamn.localeCompare(b.sortnamn, 'sv'))

    const matTräffar: Träff[] = []
    for (const rad of matIndex) {
      const r = rangera(rad.nyckel, q)
      if (r >= 0)
        matTräffar.push({ typ: 'mat', mat: rad.mat, antal: rad.antal, rang: r, sortnamn: rad.mat })
    }
    matTräffar.sort((a, b) => a.rang - b.rang || a.sortnamn.localeCompare(b.sortnamn, 'sv'))

    // Smakorden mellan grupperna och produkterna: mer specifika än en grupp,
    // bredare än en enskild produkt.
    const ordTräffar: Träff[] = []
    for (const rad of ordIndex) {
      const r = rangera(rad.nyckel, q)
      if (r >= 0)
        ordTräffar.push({ typ: 'ord', ord: rad.ord, antal: rad.antal, rang: r, sortnamn: rad.ord })
    }
    ordTräffar.sort((a, b) => a.rang - b.rang || b.sortnamn.localeCompare(a.sortnamn, 'sv'))

    const produktTräffar: Träff[] = []
    for (const rad of produktIndex) {
      const r = rangera(rad.namn, q)
      const träff = r >= 0 ? r : rad.producent.includes(q) ? 3 : -1
      if (träff >= 0)
        produktTräffar.push({
          typ: 'produkt',
          produkt: rad.produkt,
          rang: träff,
          sortnamn: heltNamn(rad.produkt),
        })
    }
    produktTräffar.sort((a, b) => a.rang - b.rang || a.sortnamn.localeCompare(b.sortnamn, 'sv'))

    return [...ut, ...matTräffar, ...ordTräffar.slice(0, 6), ...produktTräffar].slice(
      0,
      MAX_TRÄFFAR,
    )
  }, [fråga, produktIndex, gruppIndex, ordIndex, matIndex])

  function välj(t: Träff) {
    if (t.typ === 'grupp') onVäljGrupp(t.grupp)
    else if (t.typ === 'ord') onVäljOrd(t.ord)
    else if (t.typ === 'mat') onVäljMat(t.mat)
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
            ? `Sök namn, producent, ${karta.grupp.en}, smakord eller mat`
            : `Sök ${karta.grupp.en}, smakord eller mat`
        }
        onChange={(e) => {
          setFråga(e.target.value)
          setMarkerad(0)
          setÖppen(true)
        }}
        onFocus={() => setÖppen(true)}
        onKeyDown={tangent}
        aria-label={`Sök i ${karta.namn.toLowerCase()}kartan`}
      />

      {visaLista && (
        <ul className="sok-traffar">
          {träffar.length === 0 && <li className="sok-tomt">Inget matchar</li>}
          {träffar.map((t, i) => {
            const nyckel =
              t.typ === 'grupp'
                ? 'G' + t.grupp.namn
                : t.typ === 'ord'
                  ? 'O' + t.ord
                  : t.typ === 'mat'
                    ? 'M' + t.mat
                    : 'P' + t.produkt.id
            const mörkhet =
              t.typ === 'grupp' ? t.grupp.mörkhet : t.typ === 'produkt' ? t.produkt.mörkhet : null
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
                  {t.typ === 'ord' ? (
                    <span className="sok-ordprick">”</span>
                  ) : t.typ === 'mat' ? (
                    <span className="sok-ordprick">·</span>
                  ) : (
                    <span className="sok-prick" style={{ background: kulör.fyllning(mörkhet) }} />
                  )}
                  {t.typ === 'ord' ? (
                    <>
                      <span className="sok-namn">{t.ord}</span>
                      <span className="sok-stil">smakord</span>
                      <span className="sok-meta">{t.antal} beskrivs så</span>
                    </>
                  ) : t.typ === 'mat' ? (
                    <>
                      <span className="sok-namn">{t.mat.toLowerCase()}</span>
                      <span className="sok-stil">mat</span>
                      <span className="sok-meta">{t.antal} passar till</span>
                    </>
                  ) : t.typ === 'grupp' ? (
                    <>
                      <span className="sok-namn">{t.grupp.namn}</span>
                      <span className="sok-stil">{karta.grupp.en}</span>
                      <span className="sok-meta">
                        {t.grupp.förälder} · {t.grupp.antal} st
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="sok-namn">{heltNamn(t.produkt)}</span>
                      <span className="sok-stil">{grupprad(t.produkt, karta)}</span>
                      <span className="sok-meta">{producentRad(t.produkt)}</span>
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
