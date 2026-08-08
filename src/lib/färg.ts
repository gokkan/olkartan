/**
 * SRM-skalan är appens färgsystem. Prickarna bär all kulör; gränssnittet
 * runt omkring håller sig neutralt.
 *
 * Stegen är plockade ur en SRM-tabell och inte ur tomma luften — halmgult
 * ligger runt SRM 2, bärnsten runt 10, brunt runt 20, nästan svart över 40.
 */
const SKALA: [number, [number, number, number]][] = [
  [0.0, [0xf7, 0xe7, 0xa6]], // halm
  [0.15, [0xf2, 0xcd, 0x5c]], // ljus gul
  [0.25, [0xe8, 0xa8, 0x30]], // gyllene
  [0.4, [0xd0, 0x7c, 0x1e]], // bärnsten
  [0.55, [0xa9, 0x53, 0x1c]], // koppar
  [0.7, [0x76, 0x33, 0x17]], // brun
  [0.85, [0x45, 0x1e, 0x12]], // mörkbrun
  [1.0, [0x1c, 0x12, 0x0e]], // nästan svart
]

export function srm(mörkhet: number | null): string {
  const v = Math.min(1, Math.max(0, mörkhet ?? 0.3))
  let i = 0
  while (i < SKALA.length - 2 && v > SKALA[i + 1][0]) i++
  const [a, fa] = SKALA[i]
  const [b, fb] = SKALA[i + 1]
  const t = b === a ? 0 : (v - a) / (b - a)
  const k = fa.map((c, j) => Math.round(c + (fb[j] - c) * t))
  return `rgb(${k[0]} ${k[1]} ${k[2]})`
}

/** Mörka prickar försvinner mot mörk bakgrund. En tunn ljus kant räddar dem. */
export function kant(mörkhet: number | null): string {
  const v = Math.min(1, Math.max(0, mörkhet ?? 0.3))
  return `rgb(255 255 255 / ${(0.08 + v * 0.28).toFixed(2)})`
}

/**
 * Samma skala, men beskuren i den mörka änden.
 *
 * På kartan får en nästan svart prick en ljus kant som håller den synlig mot
 * bakgrunden. En stapel har ingen kant att luta sig mot — en imperial stout
 * ritad i sin äkta SRM-ton försvinner i sitt eget spår, kontrast 1,03 mot 1,0
 * för ingen skillnad alls.
 *
 * Taket är satt där kontrasten når 3:1, riktlinjen för grafiska element. Det
 * kostar nyans i den mörka änden: stout och amber får samma kopparton. Det är
 * rätt pris, för stapelns färg är dekoration som knyter panelen till kartan —
 * datan ligger i längden och talet bredvid.
 */
export const TAK_FÖR_STAPEL = 0.55

export function srmStapel(mörkhet: number | null): string {
  return srm(Math.min(TAK_FÖR_STAPEL, mörkhet ?? 0.3))
}

/**
 * Ölmolnets prickar är bara ett par pixlar stora. En stor prick klarar sin
 * äkta ton eftersom kanten bär den, men en liten nästan svart prick blir en
 * ihålig ring — man ser konturen och inget innehåll. Taket ligger högre än
 * staplarnas: här räcker det att fyllningen skiljer sig från bakgrunden.
 */
export function srmLitenPrick(mörkhet: number | null): string {
  return srm(Math.min(0.84, mörkhet ?? 0.3))
}

/**
 * Ringen runt den valda stilen.
 *
 * När en stil är vald slutar dess cirkel vara en prick och blir en behållare
 * för ölen inuti. Den ritas som en kontur, och konturen måste synas även för
 * en imperial stout — därför är taket lägre än någon annanstans. Kulören
 * stannar ändå i SRM-familjen, så en stout får en varm brun ring och en
 * pilsner en gyllene.
 */
export function srmRing(mörkhet: number | null): string {
  return srm(Math.min(0.55, mörkhet ?? 0.3))
}
