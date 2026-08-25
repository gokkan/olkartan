/**
 * Urvalet i adressfältet.
 *
 * En karta som visar någon något är inte klar förrän man kan skicka länken.
 * Allt som går att välja i appen ryms i webbadressens hash, så att "kolla på
 * den här" fungerar — och så att bakåtknappen gör det man förväntar sig.
 *
 * Hashen används i stället för sökvägen eftersom sajten ligger på statisk
 * hosting utan omskrivningsregler; en riktig sökväg skulle ge 404 vid
 * omladdning.
 */

export type Läge = {
  /** Vilken karta: öl, rött eller vitt. Utelämnad betyder den första. */
  karta?: string
  grupp?: string
  produkt?: string
  ord?: string
  mat?: string
  /** Om-rutan. Ligger i hashen som allt annat, så att "läs hur den räknas"
   *  går att skicka som länk och bakåtknappen stänger den. */
  om?: string
  /** `3d` för det roterbara molnet. Kameravinkeln ligger med flit utanför —
   *  den ändras hela tiden, och en hash som skrivs om per bildruta gör
   *  bakåtknappen obrukbar. Länken öppnar molnet, inte en viss vy av det. */
  vy?: string
  /** Vilken smakklocka prickarna färgas efter. Utelämnad = dryckens egen färg. */
  farg?: string
  /** Ursprungsländer, kommaseparerade. Utelämnad betyder alla — filtret är ett
   *  raster över kartan, inte ett val av något, så tomt är det normala läget.
   *  Inget av Systembolagets 53 landsnamn innehåller komma. */
  land?: string
}

const NYCKLAR = ['karta', 'grupp', 'produkt', 'ord', 'mat', 'om', 'vy', 'farg', 'land'] as const

/** Landfiltret som lista. Tom lista betyder att allt får synas. */
export const läsLänder = (l: Läge): string[] => (l.land ? l.land.split(',').filter(Boolean) : [])

/** Motsatsen. Tom lista tar bort nyckeln helt i stället för att skriva `land=`. */
export const skrivLänder = (länder: string[]): string | undefined =>
  länder.length ? länder.join(',') : undefined

export function läsLäge(hash = location.hash): Läge {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const ut: Läge = {}
  for (const k of NYCKLAR) {
    const v = p.get(k)
    if (v) ut[k] = v
  }
  // Äldre länkar delade innan kartorna blev flera. De pekar alltid på ölen.
  const gammalStil = p.get('stil')
  const gammalÖl = p.get('öl')
  if (gammalStil && !ut.grupp) ut.grupp = gammalStil
  if (gammalÖl && !ut.produkt) ut.produkt = gammalÖl
  return ut
}

export function tillHash(läge: Läge): string {
  const p = new URLSearchParams()
  for (const k of NYCKLAR) if (läge[k]) p.set(k, läge[k]!)
  const s = p.toString()
  return s ? '#' + s : ''
}

/**
 * Skriver läget utan att lägga till en post i historiken för varje klick —
 * annars måste man trycka bakåt tjugo gånger för att komma ur appen. Bara
 * byte av det man tittar på räknas som ett steg värt att gå tillbaka till.
 */
export function skrivLäge(läge: Läge, nyPost: boolean) {
  const hash = tillHash(läge)
  const url = location.pathname + location.search + hash
  if (hash === location.hash || (!hash && !location.hash)) return
  if (nyPost) history.pushState(null, '', url)
  else history.replaceState(null, '', url)
}

export const ärTomt = (l: Läge) => !NYCKLAR.some((k) => l[k])
