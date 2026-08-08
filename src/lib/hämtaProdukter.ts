import { useEffect, useState } from 'react'
import type { Produkt } from './typer'

/**
 * Produktdatan är 2,3 MB och behövs först när någon klickar på en stil, så den
 * ligger utanför bundlen. Hämtningen startar direkt vid inladdning ändå —
 * kartan är ritad långt innan den är klar, och då ligger datan på plats när
 * det första klicket kommer.
 */
let cache: Promise<Produkt[]> | null = null

function ladda(): Promise<Produkt[]> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/produkter.json`).then((r) => {
    if (!r.ok) throw new Error(`kunde inte hämta produkter (HTTP ${r.status})`)
    return r.json() as Promise<Produkt[]>
  })
  return cache
}

export function useProdukter() {
  const [produkter, setProdukter] = useState<Produkt[] | null>(null)
  const [fel, setFel] = useState<string | null>(null)

  useEffect(() => {
    let avbruten = false
    ladda().then(
      (p) => !avbruten && setProdukter(p),
      (e: Error) => !avbruten && setFel(e.message),
    )
    return () => {
      avbruten = true
    }
  }, [])

  return { produkter, fel }
}
