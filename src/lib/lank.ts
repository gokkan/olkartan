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
  stil?: string
  öl?: string
  ord?: string
  fast?: boolean
}

const NYCKLAR = ['stil', 'öl', 'ord', 'fast'] as const

export function läsLäge(hash = location.hash): Läge {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const ut: Läge = {}
  const stil = p.get('stil')
  const öl = p.get('öl')
  const ord = p.get('ord')
  if (stil) ut.stil = stil
  if (öl) ut.öl = öl
  if (ord) ut.ord = ord
  if (p.get('fast') === '1') ut.fast = true
  return ut
}

export function tillHash(läge: Läge): string {
  const p = new URLSearchParams()
  if (läge.stil) p.set('stil', läge.stil)
  if (läge.öl) p.set('öl', läge.öl)
  if (läge.ord) p.set('ord', läge.ord)
  if (läge.fast) p.set('fast', '1')
  const s = p.toString()
  return s ? '#' + s : ''
}

/**
 * Skriver läget utan att lägga till en post i historiken för varje klick —
 * annars måste man trycka bakåt tjugo gånger för att komma ur appen. Bara
 * byte av stil, öl eller smakord räknas som ett steg värt att gå tillbaka
 * till; filtret ändrar bara den nuvarande posten.
 */
export function skrivLäge(läge: Läge, nyPost: boolean) {
  const hash = tillHash(läge)
  const url = location.pathname + location.search + hash
  if (hash === location.hash || (!hash && !location.hash)) return
  if (nyPost) history.pushState(null, '', url)
  else history.replaceState(null, '', url)
}

export const ärTomt = (l: Läge) => !NYCKLAR.some((k) => l[k])
