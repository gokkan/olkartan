import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Meta, Stil } from './lib/typer'
import { srm, kant } from './lib/färg'

const W = 1000
const H = 700
const MARGINAL = 60

type Vy = { k: number; tx: number; ty: number }

type Props = {
  stilar: Stil[]
  meta: Meta
  vald: string | null
  onVälj: (s: Stil) => void
}

export default function Karta({ stilar, meta, vald, onVälj }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [vy, setVy] = useState<Vy>({ k: 1, tx: 0, ty: 0 })
  const [hovrad, setHovrad] = useState<Stil | null>(null)
  const [pekare, setPekare] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; rörd: boolean } | null>(null)

  /* Datakoordinater → ritytan. Y vänds: PCA räknar uppåt, SVG nedåt. */
  const punkter = useMemo(() => {
    const xs = stilar.map((s) => s.x)
    const ys = stilar.map((s) => s.y)
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const y0 = Math.min(...ys)
    const y1 = Math.max(...ys)
    const sx = (W - 2 * MARGINAL) / (x1 - x0)
    const sy = (H - 2 * MARGINAL) / (y1 - y0)
    const maxAntal = Math.max(...stilar.map((s) => s.antal))
    return stilar.map((s) => ({
      stil: s,
      px: MARGINAL + (s.x - x0) * sx,
      py: H - MARGINAL - (s.y - y0) * sy,
      // Kvadratrot, inte linjärt: annars äter IPA upp halva kartan.
      r: 4 + 20 * Math.sqrt(s.antal / maxAntal),
    }))
  }, [stilar])

  /* Etiketter placeras girigt, störst stil först. En etikett måste vara fri
   * från både andra etiketter och alla prickar — annars hoppas den över och
   * dyker istället upp vid hover. Testet görs i skärmenheter, så fler
   * etiketter träder fram när man zoomar in. Det är meningen. */
  const etiketter = useMemo(() => {
    type Ruta = { x: number; y: number; w: number; h: number; ägare?: string }
    const upptaget: Ruta[] = punkter.map((p) => ({
      x: p.px - p.r / vy.k,
      y: p.py - p.r / vy.k,
      w: (2 * p.r) / vy.k,
      h: (2 * p.r) / vy.k,
      ägare: p.stil.namn,
    }))
    const krockar = (a: Ruta, egen: string) =>
      upptaget.some(
        (q) =>
          q.ägare !== egen &&
          a.x < q.x + q.w &&
          a.x + a.w > q.x &&
          a.y < q.y + q.h &&
          a.y + a.h > q.y,
      )

    const höjd = 12 / vy.k
    // Namn → baslinje för texten, så att ritningen använder exakt den plats
    // kollisionstestet godkände.
    const valda = new Map<string, number>()
    for (const p of [...punkter].sort((a, b) => b.stil.antal - a.stil.antal)) {
      const bredd = (p.stil.namn.length * 5.6) / vy.k
      // Under pricken, ovanför, och sist tvärs över den egna pricken. Det
      // tredje läget räddar de största stilarna, som ligger tätast och annars
      // blir de enda utan namn. Texten har mörk kontur och tål underlaget.
      const kandidater = [
        p.py + p.r / vy.k + 3 / vy.k,
        p.py - p.r / vy.k - höjd - 3 / vy.k,
        p.py - höjd / 2,
      ]
      for (const y of kandidater) {
        const ruta = { x: p.px - bredd / 2, y, w: bredd, h: höjd, ägare: p.stil.namn }
        if (krockar(ruta, p.stil.namn)) continue
        upptaget.push(ruta)
        valda.set(p.stil.namn, y + höjd * 0.8)
        break
      }
    }
    return valda
  }, [punkter, vy.k])

  function tillSvg(e: { clientX: number; clientY: number }) {
    const ctm = svgRef.current?.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  /* React kopplar sina hjul-lyssnare som passiva, och då tystas
     preventDefault. Zoomen måste därför kopplas för hand för att inte
     samtidigt rulla sidan. */
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    function hjul(e: globalThis.WheelEvent) {
      e.preventDefault()
      const { x, y } = tillSvg(e)
      setVy((v) => {
        const k = Math.min(12, Math.max(0.6, v.k * Math.exp(-e.deltaY * 0.0016)))
        // Håll punkten under pekaren stilla medan skalan ändras.
        return { k, tx: x - ((x - v.tx) * k) / v.k, ty: y - ((y - v.ty) * k) / v.k }
      })
    }
    el.addEventListener('wheel', hjul, { passive: false })
    return () => el.removeEventListener('wheel', hjul)
  }, [])

  function nedPekare(e: ReactPointerEvent<SVGSVGElement>) {
    const { x, y } = tillSvg(e)
    drag.current = { x, y, tx: vy.tx, ty: vy.ty, rörd: false }
  }

  function rörPekare(e: ReactPointerEvent<SVGSVGElement>) {
    setPekare({ x: e.clientX, y: e.clientY })
    const d = drag.current
    if (!d) return
    const { x, y } = tillSvg(e)
    // Några pixlars darr när man klickar ska inte räknas som en dragning.
    if (!d.rörd && Math.hypot(x - d.x, y - d.y) > 3 / vy.k) {
      d.rörd = true
      // Pekaren fångas först när en dragning faktiskt börjat. Fångar man redan
      // vid pointerdown omdirigeras click-händelsen till svg-elementet, och då
      // går prickarna inte att klicka på över huvud taget.
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    setVy((v) => ({ ...v, tx: d.tx + (x - d.x), ty: d.ty + (y - d.y) }))
  }

  const släpp = () => (drag.current = null)

  /* Ett klick som avslutar en panorering ska inte välja stilen under fingret. */
  function klicka(s: Stil) {
    if (drag.current?.rörd) return
    onVälj(s)
  }

  const [xAxel, yAxel] = meta.axlar

  return (
    <div className="karta">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={nedPekare}
        onPointerMove={rörPekare}
        onPointerUp={släpp}
        onPointerLeave={() => {
          släpp()
          setHovrad(null)
        }}
      >
        <g transform={`translate(${vy.tx} ${vy.ty}) scale(${vy.k})`}>
          {/* Prickarna först, etiketterna i eget lager ovanpå — annars målar
              en senare prick över en tidigare grannes namn. */}
          {punkter.map((p) => {
            const aktiv = hovrad?.namn === p.stil.namn
            const utvald = vald === p.stil.namn
            return (
              <circle
                key={p.stil.namn}
                data-stil={p.stil.namn}
                cx={p.px}
                cy={p.py}
                r={p.r / vy.k}
                fill={srm(p.stil.mörkhet)}
                stroke={utvald || aktiv ? 'rgb(255 255 255 / 0.85)' : kant(p.stil.mörkhet)}
                strokeWidth={(utvald ? 2.5 : aktiv ? 2 : 1) / vy.k}
                onPointerEnter={() => setHovrad(p.stil)}
                onClick={() => klicka(p.stil)}
              />
            )
          })}
          {punkter.map((p) => {
            const aktiv = hovrad?.namn === p.stil.namn
            const utvald = vald === p.stil.namn
            const y = etiketter.get(p.stil.namn)
            // Hovrad och vald stil får alltid sitt namn, även utan ledig plats.
            if (y === undefined && !aktiv && !utvald) return null
            return (
              <text
                key={p.stil.namn}
                x={p.px}
                y={y ?? p.py + p.r / vy.k + 12 / vy.k}
                textAnchor="middle"
                fontSize={11 / vy.k}
                className={aktiv || utvald ? 'etikett aktiv' : 'etikett'}
              >
                {p.stil.namn}
              </text>
            )
          })}
        </g>
      </svg>

      {/* Axlarna namnges av de ord som väger tyngst i respektive riktning —
          hämtade ur meta.json, inte handskrivna. */}
      <div className="axel vänster">← {xAxel.negativ.slice(0, 3).join(', ')}</div>
      <div className="axel höger">{xAxel.positiv.slice(0, 3).join(', ')} →</div>
      <div className="axel upp">↑ {yAxel.positiv.slice(0, 3).join(', ')}</div>
      <div className="axel ned">↓ {yAxel.negativ.slice(0, 3).join(', ')}</div>

      {hovrad && (
        <div className="knappnål" style={{ left: pekare.x + 14, top: pekare.y + 14 }}>
          <strong>{hovrad.namn}</strong>
          <span>{hovrad.antal} öl</span>
        </div>
      )}
    </div>
  )
}
