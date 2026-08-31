/**
 * Vilken prick pekaren är på i 3D-molnet.
 *
 * Läget byggdes en gång helt utan träffytor, och skälet som står i `Karta3D`
 * var tre saker man slapp: djupsorterad träffprövning, etikettkollisioner och
 * en tredje gest på telefonen. Hovring hämtar tillbaka den första — det är den
 * här filen — men inte de andra två. Rutan är ett enda element som följer
 * pekaren, så det finns ingenting att krocka med, och hovring finns inte på
 * pekskärm, så dragningen rörs inte.
 *
 * Funktionen ligger utanför komponenten för att kunna prövas. Att den främsta
 * pricken vinner är hela poängen, och det är precis en sådan sak som går sönder
 * tyst den dag någon vänder på sorteringen.
 */

/** Så mycket som prickarna redan bär när de är projicerade. */
export type Prick = { px: number; py: number; r: number }

/**
 * Den främsta pricken under punkten, eller null.
 *
 * Listan förutsätts sorterad bakifrån och fram, som `punkter` i `Karta3D` är —
 * därför prövas den baklänges: den först funna är den som ligger överst, alltså
 * den man tror sig peka på.
 *
 * `r` är prickens grundradie; `skala` är luppen den ritas med. Räckvidden
 * räknas på den ritade storleken, inte grundradien — annars blir träffytan
 * mindre än pricken man ser på en trång skärm.
 *
 * `slop` finns för att molnets prickar är drygt tre ritenheter och annars
 * nästan omöjliga att träffa. Den hålls liten med flit: blir den stor svarar
 * ett tätt moln alltid någonting, och ett svar man inte kan lita på är sämre än
 * inget svar alls.
 */
export function träffa<P extends Prick>(
  punkter: readonly P[],
  x: number,
  y: number,
  skala: number,
  slop: number,
): P | null {
  for (let i = punkter.length - 1; i >= 0; i--) {
    const p = punkter[i]
    const räckvidd = p.r * skala + slop
    if (Math.hypot(p.px - x, p.py - y) <= räckvidd) return p
  }
  return null
}
