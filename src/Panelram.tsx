import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useSmalSkärm } from './lib/skarm'

/** Så långt ned man måste dra innan kortet stängs. */
const STÄNGGRÄNS = 90

/**
 * Ramen runt panelen — samma för stilvyn och smakordsvyn.
 *
 * På telefon är panelen ett kort som glider upp underifrån och går att svepa
 * ned igen. Svepet startar bara från greppet högst upp: tar man tag var som
 * helst i kortet slåss svepet med rullningen, och då blir listan omöjlig att
 * läsa.
 */
export default function Panelram({
  children,
  onStäng,
}: {
  children: ReactNode
  onStäng: () => void
}) {
  const smal = useSmalSkärm()
  const [dy, setDy] = useState(0)
  const [drar, setDrar] = useState(false)
  const start = useRef(0)

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
    // Bara nedåt. Att dra kortet uppåt över sin egen kant ser trasigt ut.
    setDy(Math.max(0, e.clientY - start.current))
  }

  function upp() {
    if (!drar) return
    setDrar(false)
    if (dy > STÄNGGRÄNS) onStäng()
    setDy(0)
  }

  return (
    <aside
      className={`panel${drar ? ' drar' : ''}`}
      style={dy ? { transform: `translateY(${dy}px)` } : undefined}
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
          aria-label="Dra ned för att stänga"
          onKeyDown={(e) => e.key === 'Enter' && onStäng()}
        >
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
