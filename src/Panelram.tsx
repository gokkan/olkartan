import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useSmalSkärm } from './lib/skarm'

/** Hur långt man måste dra innan kortet byter läge. */
const GRÄNS = 60
/** Om inget `data-kik` hittas: så högt kortet öppnas ändå. */
const KIK_RESERV = 150
/* Kiket slutar inte vid rubriken utan en bit in i nästa stycke. Slutar det
   snyggt vid en kant ser kortet färdigt ut, och då finns ingen anledning att
   dra i det. En avklippt rad under en toning säger att det finns mer. */
const GLUGG = 34

/**
 * Ramen runt panelen — samma för stilvyn, produktvyn och urvalsvyn.
 *
 * På telefon är panelen ett kort med två lägen. Vid första trycket kommer det
 * upp bara så mycket att rubriken syns, resten av skärmen är fortfarande karta
 * — man ska kunna trycka sig runt bland prickarna utan att kortet står i
 * vägen. Vill man läsa drar man upp det, och drar man ned från kiket stängs
 * det.
 *
 * Kikhöjden mäts fram ur innehållet i stället för att gissas: vyerna märker
 * ut sin sista rubrikrad med `data-kik`, och kortet öppnas precis så långt.
 * Ett ölnamn som går i två rader får då mer plats än ett som går i en, och
 * bilden i produktvyn räknas med.
 *
 * Svepet startar bara från greppet högst upp. Tar man tag var som helst i
 * kortet slåss svepet med rullningen, och då blir listan omöjlig att läsa.
 * Ett vanligt tryck på kortet räcker däremot för att fälla upp det.
 */
export default function Panelram({
  children,
  onStäng,
}: {
  children: ReactNode
  onStäng: () => void
}) {
  const smal = useSmalSkärm()
  const ramen = useRef<HTMLElement>(null)
  const [öppet, setÖppet] = useState(false)
  const [mått, setMått] = useState({ höjd: 0, kik: KIK_RESERV })
  const [dy, setDy] = useState(0)
  const [drar, setDrar] = useState(false)
  /* Kortet ritas första gången nedanför skärmkanten och glider upp till sitt
     läge. Utan det steget står det bara där. */
  const [inne, setInne] = useState(false)
  const start = useRef(0)

  const mät = useCallback(() => {
    const el = ramen.current
    if (!el) return
    const höjd = el.offsetHeight
    const märke = el.querySelector('[data-kik]')
    const kik = märke
      ? märke.getBoundingClientRect().bottom - el.getBoundingClientRect().top + GLUGG
      : KIK_RESERV
    // Samma värden ut ska inte ge en ny rendering: mätningen körs om varje
    // gång innehållet byts, och ett nytt objekt varje gång vore en snurra.
    setMått((f) => (f.höjd === höjd && f.kik === kik ? f : { höjd, kik: Math.min(höjd, kik) }))
  }, [])

  useLayoutEffect(() => {
    if (!smal) return
    mät()
    const el = ramen.current
    if (!el) return
    const ro = new ResizeObserver(mät)
    ro.observe(el)
    // Också märket självt. Kortet har en fast höjd och ändrar aldrig storlek,
    // men rubrikstycket gör det — flaskbilden kommer över nätet och skjuter
    // ned resten när den landar. Mäts kiket bara en gång hamnar bilden under
    // skärmkanten.
    const märke = el.querySelector('[data-kik]')
    if (märke) ro.observe(märke)
    return () => ro.disconnect()
  }, [smal, mät, children])

  useEffect(() => {
    if (!smal) return
    const id = requestAnimationFrame(() => setInne(true))
    return () => cancelAnimationFrame(id)
  }, [smal])

  /* Var kortet vilar: nere vid kiket, eller uppe. Under ett drag läggs
     fingrets förflyttning ovanpå, begränsad till mellan helt uppe och helt
     nere. */
  const vila = öppet ? 0 : Math.max(0, mått.höjd - mått.kik)
  const förskjutning = inne
    ? Math.min(mått.höjd, Math.max(0, vila + dy))
    : Math.max(mått.höjd, 1000)

  function ned(e: ReactPointerEvent<HTMLDivElement>) {
    start.current = e.clientY
    setDrar(true)
    // Fångsten är en bekvämlighet, inte ett krav — svepet fungerar utan den.
    // Utan try kastar den om pekaren hunnit släppas, och tar med sig panelen.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* pekaren finns inte längre */
    }
  }

  function rör(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drar) return
    setDy(e.clientY - start.current)
  }

  /* Ett tryck var som helst på kortet fäller upp det. I kikläget är
     innehållet under rubriken ändå avstängt för pekaren, så det finns inget
     att träffa fel på — och den som inte förstår greppet hittar ändå in. */
  function tryck(e: ReactMouseEvent<HTMLElement>) {
    if (öppet) return
    if ((e.target as Element).closest('.grepp, .stäng')) return
    setÖppet(true)
  }

  function upp() {
    if (!drar) return
    setDrar(false)
    const rörelse = dy
    setDy(0)
    // Ett tryck utan rörelse är en växling: det är den enda gest som finns
    // för den som inte förstår att kortet går att dra.
    if (Math.abs(rörelse) < 6) {
      setÖppet((v) => !v)
      return
    }
    if (rörelse < -GRÄNS) setÖppet(true)
    else if (rörelse > GRÄNS) {
      if (öppet) setÖppet(false)
      else onStäng()
    }
  }

  return (
    <aside
      ref={ramen}
      className={`panel${drar ? ' drar' : ''}${smal && !öppet ? ' kikar' : ''}`}
      onClick={smal ? tryck : undefined}
      style={
        smal
          ? ({
              transform: `translateY(${förskjutning}px)`,
              '--kik': `${mått.kik}px`,
            } as CSSProperties)
          : undefined
      }
    >
      {smal && (
        <div
          className="grepp"
          onPointerDown={ned}
          onPointerMove={rör}
          onPointerUp={upp}
          onPointerCancel={upp}
          role="button"
          tabIndex={0}
          aria-expanded={öppet}
          aria-label={öppet ? 'Dra ned för att fälla ihop' : 'Dra upp för att läsa mer'}
          onKeyDown={(e) => e.key === 'Enter' && setÖppet((v) => !v)}
        >
          {/* Två streck som bildar en flack pil uppåt i kikläget och lägger
              sig platta när kortet är uppfällt. */}
          <span />
          <span />
        </div>
      )}

      <button className="stäng" onClick={onStäng} aria-label="Stäng panelen">
        ×
      </button>

      {children}
    </aside>
  )
}
