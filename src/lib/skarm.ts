import { useEffect, useState } from 'react'

/** Sant på telefonbredd. Används för att välja beteende, inte bara utseende —
 *  det som bara är utseende hör hemma i CSS. */
export function useSmalSkärm(fråga = '(max-width: 760px)') {
  const [smal, setSmal] = useState(() => matchMedia(fråga).matches)
  useEffect(() => {
    const m = matchMedia(fråga)
    const vid = () => setSmal(m.matches)
    m.addEventListener('change', vid)
    return () => m.removeEventListener('change', vid)
  }, [fråga])
  return smal
}
