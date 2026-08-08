import { useState } from 'react'
import type { Produkt } from './lib/typer'
import { heltNamn } from './lib/urval'

/**
 * Flaskbilden, hämtad direkt från Systembolagets bildserver.
 *
 * Bilden är en bonus, aldrig en del av sidans form: 55 av 3 375 öl saknar
 * bild i katalogen, och adressen är någon annans att ändra på. Därför två
 * spärrar — `bild`-flaggan ur katalogen slipper anropet helt, och `onError`
 * tar hand om resten. I båda fallen försvinner elementet och panelen ser ut
 * precis som den gjorde innan bilderna fanns. Ingen bruten länk, ingen
 * platshållarruta.
 *
 * Adressen räknas ut ur artikelnumret. Utan storlekssuffix svarar servern 404
 * — `_100`, `_200` och `_400` finns.
 */
export default function Etikett({ produkt }: { produkt: Produkt }) {
  const [trasig, setTrasig] = useState(false)
  if (!produkt.bild || trasig) return null

  const id = produkt.id
  const bas = `https://product-cdn.systembolaget.se/productimages/${id}/${id}`

  return (
    <img
      className="etikettbild"
      src={`${bas}_200.png`}
      srcSet={`${bas}_100.png 100w, ${bas}_200.png 200w, ${bas}_400.png 400w`}
      sizes="72px"
      alt={heltNamn(produkt)}
      loading="lazy"
      decoding="async"
      onError={() => setTrasig(true)}
    />
  )
}
