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
