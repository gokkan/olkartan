import type { Skala } from './färg'

/** En smakklocka: beska för öl, strävhet för rött vin. Max skiljer per dryck. */
export type Klockaxel = { nyckel: string; etikett: string; max: number }

/**
 * Vad prickarnas färg kan visa. Klockorna är smakprofilen; pris och
 * alkoholhalt är fakta om flaskan.
 *
 * `spann` är var produkterna faktiskt ligger, inte skalans ändar — mot hela
 * klockskalan blir kartan enfärgad. Se byggskriptet.
 */
export type Färgkanal = {
  nyckel: string
  etikett: string
  sort: 'klocka' | 'annat'
  spann: [number, number]
  /** Priset spänner från tjugolappen till fyrsiffrigt och behöver logaritm. */
  logg?: boolean
  /** Sätts efter talen i teckenförklaringen: " kr/l", " %". */
  enhet?: string
}

/**
 * En prick på kartan. En ölstil eller en vindruva — kartan bryr sig inte om
 * vilket, och därför heter den grupp och inte stil.
 */
export type Grupp = {
  namn: string
  /** Överkategori för öl, vanligaste ursprungsland för en druva. */
  förälder: string
  antal: number
  liten: boolean
  x: number
  y: number
  /** Tredje huvudkomponenten. Används bara av 3D-läget. */
  z: number
  klockor: Record<string, number>
  abv: number
  prisPerLiter: number
  mörkhet: number | null
  kännetecken: string[]
  vektor: number[]
}

export type Produkt = {
  id: string
  namn: string
  undertitel: string | null
  // Saknas för ett fåtal produkter i sortimentet.
  bryggeri: string | null
  land: string
  /** Ett öl har en stil. Ett vin kan ha flera druvor — en Bordeaux är cabernet
   *  *och* merlot, och båda räknar vinet som sitt. */
  grupper: string[]
  förälder: string
  abv: number
  pris: number
  volym: number
  prisPerLiter: number | null
  sortiment: string
  klockor: Record<string, number>
  fatlagrad?: boolean
  /** Systembolagets matmatchning. Utanför kartan — se byggskriptet. */
  mat: string[]
  /** Om Systembolaget har en etikettbild. Adressen räknas ut ur id:t. */
  bild: boolean
  mörkhet: number | null
  smaktext: string
  termer: string[]
  /** Bara inslagen, utan karaktärsorden. Se byggskriptet. */
  smakord: string[]
  vektor: number[]
  x: number
  y: number
  /** Tredje huvudkomponenten. Används bara av 3D-läget. */
  z: number
}

/** Allt som skiljer en karta från en annan, plus dess grupper. */
export type Karta = {
  id: string
  namn: string
  kort: string
  /** Sidans namn i foten: ölkartan, rödvinskartan. */
  sida: string
  /** Vad en prick heter i text: stil, stilar, stilen — eller druva, druvor. */
  grupp: { en: string; flera: string; denna: string; obestämd: string }
  /** Vad produkterna heter: öl, viner. */
  enhet: { en: string; flera: string }
  färgskala: Skala
  klockor: Klockaxel[]
  färgkanaler: Färgkanal[]
  byggd: string
  antalProdukter: number
  antalGrupper: number
  /** Termer i smakrymden — de som är vanliga nog att räknas, inte alla ord. */
  antalTermer: number
  varians: number[]
  /** Hur stor andel av det verkliga smakavståndet som syns på kartan. Kartans
   *  två axlar är ortonormala, så kartavståndet är exakt den del av det fulla
   *  avståndet som ligger i planet — kvoten är alltså mätt, inte uppskattad.
   *  Grupperna klarar sig bra; enskilda produkter visar under hälften. */
  synligAndel: { grupp: number; produkt: number }
  axlar: { komponent: number; negativ: string[]; positiv: string[] }[]
  rattar: Record<string, number>
  ordfrekvens: Record<string, number>
  matfrekvens: Record<string, number>
  /** Produkternas ytterkanter i datakoordinater. Grupperna spänner upp ritytan,
   *  men produkterna ligger runt omkring den — kartan får inte klippa bort dem. */
  utbredning: { x0: number; x1: number; y0: number; y1: number }
  grupper: Grupp[]
}
