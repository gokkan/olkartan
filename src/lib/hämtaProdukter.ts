import { useEffect, useState } from 'react'
import type { Produkt } from './typer'

/**
 * Produktdatan är megabyte och behövs först när någon klickar på en prick, så
 * den ligger utanför bundlen. Hämtningen startar direkt vid inladdning ändå —
 * kartan är ritad långt innan den är klar, och då ligger datan på plats när
 * det första klicket kommer.
 *
 * En fil per karta, och bara den man tittar på hämtas. Byter man karta ligger
 * den förra kvar i cachen, så vägen tillbaka är gratis.
 */
const cache = new Map<string, Promise<Produkt[]>>()

function ladda(karta: string): Promise<Produkt[]> {
  let p = cache.get(karta)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/${karta}.json`).then((r) => {
      if (!r.ok) throw new Error(`kunde inte hämta produkter (HTTP ${r.status})`)
      return r.json() as Promise<Produkt[]>
    })
    cache.set(karta, p)
  }
  return p
}

export function useProdukter(karta: string) {
  const [produkter, setProdukter] = useState<Produkt[] | null>(null)
  const [fel, setFel] = useState<string | null>(null)

  useEffect(() => {
    let avbruten = false
    setProdukter(null)
    setFel(null)
    ladda(karta).then(
      (p) => !avbruten && setProdukter(p),
      (e: Error) => !avbruten && setFel(e.message),
    )
    return () => {
      avbruten = true
    }
  }, [karta])

  return { produkter, fel }
}
