export type Stil = {
  namn: string
  förälder: string
  antal: number
  liten: boolean
  x: number
  y: number
  beska: number
  fyllighet: number
  sötma: number
  syra: number
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
  stil: string
  förälder: string
  abv: number
  pris: number
  volym: number
  prisPerLiter: number | null
  sortiment: string
  beska: number
  fyllighet: number
  sötma: number
  syra: number
  fatlagrad: boolean
  /** Systembolagets matmatchning. Utanför kartan — se byggskriptet. */
  mat: string[]
  /** Om Systembolaget har en etikettbild för ölen. Adressen räknas ut ur id:t. */
  bild: boolean
  mörkhet: number | null
  smaktext: string
  termer: string[]
  /** Bara inslagen, utan karaktärsorden. Se byggskriptet. */
  smakord: string[]
  vektor: number[]
  x: number
  y: number
}

export type Meta = {
  byggd: string
  antalProdukter: number
  antalStilar: number
  varians: number[]
  axlar: { komponent: number; negativ: string[]; positiv: string[] }[]
  rattar: Record<string, number>
  ordfrekvens: Record<string, number>
  matfrekvens: Record<string, number>
  /** Produkternas ytterkanter i datakoordinater. Stilarna spänner upp ritytan,
   *  men ölen ligger runt omkring den — kartan får inte klippa bort dem. */
  utbredning: { x0: number; x1: number; y0: number; y1: number }
}
