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
  bryggeri: string
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
  mörkhet: number | null
  smaktext: string
  termer: string[]
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
}
