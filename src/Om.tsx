import type { Karta } from './lib/typer'
import Panelram from './Panelram'

/**
 * Hur kartan räknas fram, för den som blir nyfiken.
 *
 * Allt som är ett tal hämtas ur kartans egen metadata i stället för att stå
 * skrivet här. Sortimentet byts varje vecka och rattarna kan ändras; en text
 * som påstår "3 395 öl" skulle bli fel utan att någon märkte det.
 *
 * Avsnittet om vad kartan *inte* visar står med flit kvar. Två prickar som
 * ligger ovanpå varandra behöver inte vara lika — kartan visar under hälften
 * av skillnaden mellan två enskilda produkter, och det är ärligare att skriva
 * det än att låta den som upptäcker det tro att appen är trasig.
 */
export default function Om({ karta, onStäng }: { karta: Karta; onStäng: () => void }) {
  const procent = (v: number) => `${Math.round(v * 100)} %`
  const g = karta.grupp
  const e = karta.enhet
  const [xAxel, yAxel] = karta.axlar

  return (
    <Panelram onStäng={onStäng}>
      <p className="meta">om {karta.sida}</p>
      <h2>Hur platsen räknas fram</h2>
      <p className="undertitel" data-kik>
        Avstånd är smaklikhet. Ingen har placerat prickarna för hand.
      </p>

      <h3>Underlaget</h3>
      <p className="brödtext">
        Allt kommer ur Systembolagets egna uppgifter: smaktexten (”{'Rostad smak med inslag av…'}”)
        och smakklockorna ({karta.klockor.map((k) => k.etikett).join(', ')}), plus alkoholhalten.
        Ingen språkmodell är inblandad — samma sortiment ger samma karta varje gång.
      </p>

      <h3>Från text till plats</h3>
      <ol className="stegen">
        <li>
          Smaktexten delas i två sorters ord: <em>karaktären</em> före ordet ”smak”, och{' '}
          <em>inslagen</em> efter ”inslag av”.
        </li>
        <li>
          Ovanliga ord väger tyngre. ”Kavring” säger mer om {e.en} än ”frukt”, som halva sortimentet
          har.
        </li>
        <li>
          De {karta.antalTermer} ord som är vanliga nog att räknas pressas ihop till åtta mått, som
          fångar var texterna skiljer sig mest åt.
        </li>
        <li>
          Klockorna och alkoholhalten läggs till som egna mått, vägda till{' '}
          {karta.rattar.VIKT_NUM.toLocaleString('sv-SE')} mot textens ett.
        </li>
        <li>
          Varje {g.en} hamnar i mitten av sina {e.flera}, och de {karta.antalGrupper} mittpunkterna
          vrids så att de två riktningar där de skiljer sig mest blir kartans två axlar.
        </li>
      </ol>

      <h3>
        Axlarna <span className="not">namngivna av orden som väger tyngst</span>
      </h3>
      <ul className="axelfakta">
        <li>
          <span>vänster–höger</span>
          <span>
            {xAxel.negativ.slice(0, 3).join(', ')} ↔ {xAxel.positiv.slice(0, 3).join(', ')}
          </span>
        </li>
        <li>
          <span>upp–ned</span>
          <span>
            {yAxel.positiv.slice(0, 3).join(', ')} ↔ {yAxel.negativ.slice(0, 3).join(', ')}
          </span>
        </li>
      </ul>
      <p className="källnot">
        Riktningarna betyder ingenting i sig — kartan kan vridas hur som helst utan att bli mindre
        sann. Det är avstånden som bär informationen.
      </p>

      <h3>Vad kartan inte visar</h3>
      <p className="brödtext">
        Smaken har fler än två dimensioner, och en karta har två. Av skillnaden mellan två {g.flera}{' '}
        syns <strong>{procent(karta.synligAndel.grupp)}</strong> på kartan — den är anpassad just
        efter dem. Mellan två enskilda {e.flera} syns bara{' '}
        <strong>{procent(karta.synligAndel.produkt)}</strong>.
      </p>
      <p className="brödtext">
        Därför kan två {e.flera} ligga på samma punkt utan att smaka lika. Listan <em>Liknande</em>{' '}
        räknar på hela smakprofilen och inte på avståndet i bild — det är förklaringen till att
        träffarna ofta hamnar långt bort på kartan, och ibland i en annan {g.en}.
      </p>
      <p className="brödtext">
        Knappen <strong>3D</strong> visar en tredje riktning ({karta.axlar[2].positiv[0]} ↔{' '}
        {karta.axlar[2].negativ[0]}) som molnet går att vrida runt. Fyra av fem {e.flera} som ligger
        på varandra i den platta bilden glider isär så fort man vrider. Man kan bara titta — tryck
        2D för att välja något igen.
      </p>

      <h3>Prickarnas storlek och färg</h3>
      <p className="brödtext">
        Storleken är antalet {e.flera} i {g.denna}. Färgen kommer ur Systembolagets egen
        färgbeskrivning, ord för ord — ”{karta.id === 'ol' ? 'brunsvart' : 'mörk, blålila'}”,
        ”ljusgul” — och inte ur en kategori översatt till en ton.
      </p>

      <h3>Källa</h3>
      <p className="brödtext">
        Sortimentet hämtas varje vecka från susbolaget.emrik.org, en communityspegel av
        Systembolagets öppna data som drivs av en privatperson. Kartan byggdes senast {karta.byggd}{' '}
        och innehåller {karta.antalProdukter.toLocaleString('sv-SE')} {e.flera} i{' '}
        {karta.antalGrupper} {g.flera}.
      </p>
      <p className="källnot">
        Appen presenterar och beskriver — den säljer inte, och Systembolaget står inte bakom den.{' '}
        <a href="https://github.com/gokkan/olkartan" target="_blank" rel="noreferrer">
          Koden och en längre förklaring finns på GitHub.
        </a>
      </p>
    </Panelram>
  )
}
