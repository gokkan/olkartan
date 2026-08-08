# Ölkartan

En webbapp som visar ölstilar som en karta där avstånd betyder smaklikhet. Man klickar sig in i en stil, ser produkter, och kan utgå från en öl man gillar för att hitta närliggande — med en förklaring av hur de skiljer sig.

Det här är andra utkastet. Det första byggde på ett antagande om datan som inte höll, och den korrigeringen ändrar tre av fyra faser.

---

## Vad som ändrades, och varför

**Ölen har tre smakklockor, inte fem.** Första utkastet räknade med `tasteClockBitter`, `Body`, `Sweetness`, `Fruitacid` och `Casque`. För öl är fruktsyra `0` hos samtliga 5 073 produkter — den är en vinaxel. Strävhet och rökighet likaså. Fatkaraktär är i praktiken binär: 4 058 öl har värdet 1, bara 97 har mer. Kvar blir beska, fyllighet och sötma.

**Tre axlar räcker inte.** 4 160 öl med smakdata fördelar sig på 287 unika punkter. 337 öl delar exakt samma vektor. De tjugo vanligaste punkterna täcker 62% av sortimentet. En grannsökning i den rymden returnerar hundratals träffar på avstånd noll och svarar "nästan identisk smakprofil" på nästan varje fråga.

**PCA på bara klockorna ger ingen karta.** Alla fyra laddningarna på PC1 får samma tecken — axeln blir "hur stor är ölen", inte "hur smakar den". Torr porter och stout hamnade på samma prick som India pale ale. Första utkastet förutsåg att det kunde gå fel och rådde till att justera normaliseringen. Det rådet leder fel: ingen viktning skapar en rostningsaxel ur data som inte mäter rostning.

**Lösningen ligger i smaktexten.** Systembolagets `taste`-fält är mallskrivet och följer samma mönster hos 100% av ölen:

> `<karaktär>, <karaktär> smak med <styrka>, inslag av <A>, <B> och <C>.`

Det ger ett kontrollerat vokabulär på ungefär 30 karaktärsord (*maltig, humlearomatisk, rostad, syrlig, bärig*) och 288 smakdeskriptorer, varav 156 återkommer minst fem gånger (*kaffe, kavring, grapefrukt, tallbarr, banan*). Det är i praktiken ett färdigt smaklexikon, skrivet av folk som smakat ölen.

Med texten inräknad blir 77% av ölen unika i rymden istället för 7%, och stout hamnar där stout hör hemma.

---

## Teknikval

Vite + React + TypeScript. Ingen backend, ingen databas, ingen inloggning. All data är statisk JSON som byggs in. Statisk hosting. React-state räcker — appen är för liten för Zustand.

SVG för kartan: 60 stilar ligger långt under gränsen där canvas behövs.

Ingen extern mattemodul. Byggskriptet räknar egenvektorer med potensiteration och deflation, ungefär 60 rader. Det gör pipelinen beroendefri och lätt att läsa.

**Icke-mål i v1:** användarkonton, betyg, recensioner, köplänkar, butikslager, delningsfunktioner.

---

## Fas 0 — datapipeline ✅ klar

**Källa:** `https://susbolaget.emrik.org/v1/products` — en communityspegel av Systembolagets öppna sortimentsdata. 27 198 produkter, ~100 MB, ingen autentisering. Den ersätter hela "ladda ner XML manuellt"-steget ur första utkastet.

Servern drivs av en privatperson. Hämta sällan, cacha lokalt, committa aldrig råfilen. `npm run data:hämta` hoppar över hämtningen om den lokala filen är yngre än sju dygn.

**`npm run data`** kör `scripts/bygg-data.mjs`, som:

1. filtrerar fram säljbar öl med smakdata — kastar utgångna, slutsålda och de 751 som saknar smakbeskrivning
2. tolkar smaktexten till en termvektor, tf-idf-viktad och L2-normaliserad så att en öl med sju inslag inte väger tyngre än en med tre
3. reducerar termrymden till åtta komponenter via PCA
4. lägger till beska, fyllighet, sötma, ABV och en syra-signal, standardiserade
5. aggregerar per `categoryLevel3`, kör PCA på stilarnas medelvektorer, skriver 2D-koordinater

Utdata: `src/data/stilar.json` och `meta.json`, som byggs in, samt `public/data/produkter.json`, som hämtas separat. Stilarna behövs direkt och är små; produkterna är 2,3 MB och behövs först vid ett klick, så kartan ska inte vänta på dem.

**Viktningen är den enda känsliga ratten.** `VIKT_NUM = 0.6` styr klockornas tyngd mot texten. Höjs den suddas stout och IPA ihop igen — de har nästan identiska klockvärden och det är bara texten som skiljer dem. Sänks den tappar kartan sin koppling till beska och styrka.

**Acceptanskriterium:** `npm run data` går igenom utan fel, minst 30 stilar med minst 3 produkter var. Stilar med färre flaggas `liten: true` men kastas inte.

**Utfall:** 3 632 öl, 60 stilar, varav 3 små.

Två saker som saknades i första utkastet och som är med nu: filtrering på `isDiscontinued` och `isCompletelyOutOfStock` (annars fylls kartan med öl som inte går att köpa), och pris normaliserat till kr/liter (annars blir medianpriset nonsens när en stil blandar 33 cl burk och 75 cl flaska).

---

## Fas 1 — kartan ✅ klar

En prick per stil. Radie efter kvadratroten ur antalet produkter. Zoom och pan. Vid hover: stilnamn och antal produkter, ingenting mer.

**Färgen kommer från `color`-fältet, inte från kategorin.** Fritextfältet har ett litet ordförråd — *gul*, *mörk gul*, *brungul*, *brunröd*, *brunsvart* — som mappas till en SRM-skala per produkt. Det är bättre än första utkastets uppslagstabell per `categoryLevel2`, som skulle gett alla stouts samma ton. Färg är satt på 3 529 av 3 632 öl.

**Etiketterna placeras girigt**, störst stil först, och testas mot både andra etiketter och alla prickar. Ett tredje läge — texten tvärs över sin egen prick — räddar de största stilarna, som ligger tätast och annars blir de enda utan namn. 39 av 60 syns vid standardzoom; fler träder fram när man zoomar in.

**Axlarna namnger sig själva.** Kartaxlarna är kombinationer av textkomponenterna, så byggskriptet kedjar laddningarna hela vägen tillbaka till termerna och låter de tyngsta orden sätta etiketten. Ingen handskriven text:

```
vänster  sirapslimpa, pomerans, choklad
höger    syrlig, fruktig, kryddig
upp      örter, aprikos, honung
ned      kaffe, kavring, rostad
```

**Acceptanskriterium:** inga överlappande etiketter vid standardzoom, och igenkännbara kluster. Byggskriptet kör fem kontroller vid varje bygge, mätta i enheter av kartans egen spridning:

```
✓  mörkt rostat skilt från humlebeskt   stout ↔ IPA        1.46
✓  ljusa lager ligger ihop              pilsner ↔ helles   0.16
✓  stout-släktet håller ihop            torr ↔ imperial    1.09
✓  veteölen ligger ihop                 hefeweizen ↔ witbier  0.12
✓  suröl långt från ljus lager          gueuze ↔ pilsner   2.90
```

Går någon av dem sönder efter en ändring säger skriptet till direkt istället för att man upptäcker det med ögat tre veckor senare.

---

## Fas 2 — inklick ✅ klar

Klick på en stil öppnar en panel med:

- stilens namn och föräldrakategori
- **smakprofil över de tre riktiga axlarna** — beska, fyllighet, sötma. Ett radardiagram med tre hörn är en triangel och ser trasigt ut; använd tre vågräta staplar istället, med stilens median mot hela sortimentets.
- **stilens kännetecken** — de termer som är överrepresenterade hos just den stilen jämfört med alla öl. Byggskriptet räknar redan ut dem. För torr porter och stout blir det *soja, rostade nötter, lakrits, pumpernickel, rostad*. Det säger mer om en stil än tre klocktal gör.
- produktlista sorterad efter närhet till stilens medelvektor, så att de mest typiska exemplen hamnar överst. Visa produktnamn, bryggeri, land, ABV, pris per liter, sortiment.
- de fem närmaste stilarna på kartan, klickbara

Klick på en produkt öppnar en produktvy med produktens egen profil mot stilens, plus dess smaktext i sin helhet.

**Acceptanskriterium:** man kan navigera stil → produkt → närliggande stil → produkt utan att kartan tappar zoomnivå eller position.

**Utfall:** verifierat med ett skript som zoomar och panorerar kartan, går hela vägen runt och jämför kartans transform före och efter. Den är oförändrad.

Två saker som testet fångade och som inte hade märkts av att bara läsa koden. `setPointerCapture` vid pointerdown fick webbläsaren att omdirigera click-händelsen till svg-elementet, så prickarna gick inte att klicka på över huvud taget — fångsten måste ske först när en dragning verkligen börjat. Och namnfälten måste sättas ihop: `productNameBold` är varumärket ("Gotlands Bryggeri"), `productNameThin` är ölen ("Wisby Stout"). Var för sig säger de sällan tillräckligt, och för 1 568 öl är varumärket dessutom identiskt med bryggeriet.

---

## Fas 3 — likhet med förklaring ✅ klar

Appens kärna. Bygg den noggrant.

Given en produkt, hitta de N närmaste i den gemensamma rymden. Exkludera samma produkt och samma bryggeri när namnen är nästan identiska — annars fylls listan av samma öl i tre burkstorlekar.

**Förklaringen byggs av två delar, inte en.** Första utkastet ville jämföra axel för axel. Med bara tre axlar blir de meningarna snabbt enahanda: allt handlar om beska och fyllighet. Texttermerna säger det som faktiskt skiljer två öl åt.

*Klockorna* ger gradskillnader, med första utkastets trösklar, som håller:

| Skillnad | Formulering |
|---|---|
| under 0,8 klocksteg | "samma" |
| 0,8–2,0 | "något mer/mindre" |
| över 2,0 | "tydligt mer/mindre" |

*Termerna* ger karaktärsskillnader: vilka smakord delar de två ölen, och vilka har den ena men inte den andra?

Bygg meningen av den axel där skillnaden är störst, plus ett par termer åt vardera hållet:

> Samma fyllighet, något mindre beska. Delar den rostade kaffekaraktären, men mer mörk choklad och mindre lakrits.

Om både klockor och termer ligger nära: *"Nästan identisk smakprofil."*

Lägg det i en ren funktion i `src/lib/likhet.ts` med enhetstester (vitest). Ingen LLM, inget nätverksanrop — deterministiskt och möjligt att lita på.

**Acceptanskriterium:** testerna täcker identisk profil, skillnad på en axel, skillnad på alla axlar, produkt som saknar klockvärde, och produkt utan gemensamma termer. Slå sedan upp tre öl du känner till och läs förklaringarna högt. Om någon låter fel är trösklarna fel.

**Utfall:** 20 enhetstester, som körs i deployen — de tar en halv sekund och behöver ingen webbläsare, så ett trasigt `likhet.ts` kan aldrig publiceras.

Uppläsningen gav godkänt på grannarna: Duvel ger trippels och Chimay vit, Erdinger Dunkel ger Schwarzbier och Dunkel, Brooklyn Lager ger amber ale och extra special bitter. Trösklarna satt från början.

Men den avslöjade ett språkfel som inga tal hade fångat. Karaktärsorden är adjektiv och inslagen substantiv, och de kan inte stå i samma uppräkning: *"Delar mörk choklad och rostad"*, *"men mer knäckig och torkade aprikoser"*. Byggskriptet skiljer dem nu åt i två fält, och förklaringen byggs bara av inslagen. Karaktären bärs ändå av klockorna och av platsen på kartan.

Två liknande fall i uppräkningen: leden binds med "och" när det läser bättre — *"mer choklad och mindre lakrits"* — men med komma när ett led redan innehåller ett "och", annars blir det *"mer tallbarr och grapefrukt och mindre kavring och kaffe"*.

Ett klick i "liknande öl" flyger kartan dit **bara om ölen byter stil**. Håller man sig inom samma stil finns inget att visa, och då ska vyn ligga still.

Så här låter det, med Guinness Draught som utgångspunkt:

> **Stoodley Stout** — Samma fyllighet, något mindre beska. Delar pumpernickel och lakrits, men mer nötter, mindre charkuterier och tobak.
>
> **Mick & Jack Winter Lager** *(Dunkel)* — Samma fyllighet, något mindre beska, något mer sötma. Delar mörk choklad och kaffe, men mer katrinplommon och kavring, mindre charkuterier och pumpernickel.

Den andra träffen ligger i en annan stil än den man utgick från. Det är hela poängen med att räkna avstånd i smakrymden i stället för i taxonomin.

Exponera det på två ställen: i produktvyn ("liknande öl") och som egen ingång ("jag gillade den här — vad mer?") med sökfält över hela katalogen.

---

## Sökning ✅ klar

Flyttad hit ur fas 4 efter att det visade sig vara det första man saknar när man använder appen på riktigt. Kartan är fin att titta på, men den förutsätter att man vet vilken stil man är ute efter — att slå upp en öl man redan gillar är den naturligaste ingången.

Sökrutan täcker både öl och stilar. Stilar rankas först: den som skriver "porter" vill troligen se stilen, inte de tre ölen som råkar heta så. Jämförelsen är förlåtande — å, ä och ö viks ihop med a och o, så "sot porter" hittar "Söt porter och stout". En träff på en öl öppnar dess produktvy och markerar samtidigt dess stil på kartan.

Allt sker i klienten mot data som redan är laddad. Ingen sökserver, inget index att underhålla.

Två fel byggdes bort på vägen. Tre öl saknar bryggeri, och en null där tog ner **hela sidan** — inte bara sökrutan, utan kartan med. Panelen och sökningen ligger nu var för sig innanför en felgräns, så kartan överlever att något runt omkring går sönder. Och termerna prefixas i pipelinen för att skilja karaktärsord från inslag; när prefixet kapades kolliderade de två sorternas "kaffe" och gav dubbletter.

---

## Ölmolnet och rörelsen ✅ klar

**Varje öl har en egen plats.** Byggskriptet projicerar produkterna på samma bas som stilarna, så koordinaterna fanns redan — de ritades bara inte ut. Väljer man en stil tonas dess cirkel ned till en ring och de enskilda ölen träder fram som småprickar, klickbara.

Molnet visar två saker som stilkartan döljer. Spridningen inom en stil varierar kraftigt: Berliner weisse ligger på 0,25 spridningsenheter i median, "Smaksatt/kryddad öl" på 1,29 — den senare är ingen smakstil alls utan en restkategori. Och **85 % av alla öl ligger närmare någon annan stils mittpunkt än sin egen**, med överlapp precis där gränsen är administrativ snarare än sensorisk: IPA mot New England IPA, tysk pilsner mot tjeckisk, övrig syrlig öl mot berliner weisse.

Det är argumentet för att fas 3 ska räkna likhet mellan öl och inte mellan stilar.

**Rörelsen glider.** Hjulet flyttar bara ett mål; en animeringsslinga interpolerar vyn dit med exponentiell utjämning, tidskorrigerad så att glidet tar lika lång tid på 60 som på 144 hertz. Panorering går förbi utjämningen och följer fingret direkt — utjämnad panorering känns bara trög. En sökträff flyger in mot ölens egen koordinat, och en dragning avbryter inflygningen så att de inte slåss om vyn.

**Tre saker som skärmbilden avslöjade.** En imperial stout ritad i sin äkta SRM-ton har kontrast 1,03 mot bakgrunden — den försvann helt i smakprofilens staplar. Stapelfärgen är nu beskuren där kontrasten når 3:1. Det kostar nyans i den mörka änden, men färgen är dekor: datan ligger i längden och talet.

Molnets prickar hade samma problem av en annan orsak — en kant på 1,1 px runt en radie på 3,1 gör pricken till en ihålig ring oavsett fyllning. Geometrin är omvänd nu.

Och smaktexten följer inte alltid mallen: 34 öl skriver "rostad **öl** med inslag av …" eller "humlearomatisk **doft** med …". Parsern delade bara på ordet "smak", så för dem blev hela meningen ett karaktärsord och skräp som "rostad öl med inslag av pumpernickel" hamnade i termrymden. Efter rättningen föll antalet unika termer från 412 till 305, och kartans fem kontroller ger samma värden som förut.

## Fas 4 — genomgången, och mest struken ✅

Fyra punkter stod kvar. Tre av dem överlevde inte en ärlig genomgång.

**Permalänk ✅ klar.** Stod inte i planen alls, men var den största luckan: en app vars syfte är att visa någon något var inte delbar. Hela urvalet ligger nu i adressfältet — stil, öl, smakord och filter — och hashen är sanningen, inte en spegling av ett separat tillstånd. Det gör bakåtknappen gratis. En länk till en öl behöver inte bära stilen med sig; den framgår av ölen. Och ölen slås upp i hela sortimentet, inte bland de filtrerade, så en delad länk fungerar även för mottagaren som råkar ha filtret påslaget.

**Sök på smakord ✅ klar.** "Visa mig allt med kavring" ger 290 öl, koncentrerade i det mörka rostade hörnet: imperial porter 83, torr porter 68, brown ale 20, dunkel 15, schwarzbier 11. Kostade nästan ingenting att bygga — orden var redan utplockade för att kartan ska fungera.

**Sortimentsfilter ✅ klar.** Inte en bekvämlighet utan en reparation. Sju av tio öl finns bara lokalt eller på beställning:

```
Lokalt & Småskaligt    2 596   71%
Fast sortiment           519   14%
Ordervaror               268    7%
Tillfälligt sortiment    214    6%
```

Får man fem rekommendationer och inte kan köpa fyra av dem är appen irriterande. Filtret gäller överallt — sökning, listor, liknande öl — och prickarna krymper med antalet som återstår, precis som första utkastet föreslog.

**Filter på land, pris och ABV — struket.** 84 % av sortimentet är svenskt, så ett landsfilter tar bort en sjättedel och inget mer. Pris och ABV är mjuka preferenser som inte bär sin egen yta i gränssnittet.

**"Var ska jag börja" — struket.** Appen har redan en bättre nybörjaringång: sök på en öl du druckit, se vad som liknar den. Samma jobb, ingen ny yta. En frågeguide skulle dessutom kräva en påhittad mappning från "gillar du beskt?" till en trettondimensionell vektor — det enda stället i hela appen där vi skulle gissa i stället för att mäta.

**"Jämför två öl" — struket.** Den finns redan, bara inte som egen skärm. Förklaringen i "liknande öl" *är* en jämförelse mellan två öl, kokad till en mening. En sida-vid-sida-vy skulle visa samma tre staplar två gånger.

**Automatisk inramning vid klick — struket, ersatt med en knapp.** Idén var att kartan skulle zooma så att stilens alla öl precis syns. Mätningen sa nej: medianstilens moln täcker 41 % av kartan och 15 av 57 täcker mer än halva. Inramningen hade alltså oftast inte gjort något alls, och ibland kastat in en på 8× — en kamerarörelse utan synlig regel. I stället viker grannarna undan när en stil väljs, och den som vill rama in molnet trycker på knappen i panelen.

---

## Telefon och dubbletter

**Samma öl fanns flera gånger.** Sortimentet innehåller samma öl under flera artikelnummer — burk och flaska, två storlekar, och framför allt övergångar där Systembolaget byter artikelnummer och båda ligger kvar. Pistonhead Kustom Lager fanns som artikel från 2011 och en från 2026, identiska i allt utom pantbeloppet. 214 grupper, 471 produkter, och 183 av grupperna hade dessutom exakt samma smakdata.

För en smakkarta är enheten "en öl", inte "en artikel". Byggskriptet slår ihop dem och väljer representant i tur och ordning: den som går att få tag på, den i fast sortiment, den billigaste per liter, och sist lägsta id så att utfallet blir detsamma varje körning. 3 632 öl blev 3 375.

**Nypzoom.** Fanns inte alls — bara hjulet var inkopplat. Två fingrars avstånd ger skalan och punkten under mittpunkten hålls kvar, så att zoom och tvåfingerpanorering blir samma rörelse.

Testet av den är värt en anteckning: hemmasnickrade `PointerEvent` gav falskt negativt, eftersom de tar en annan väg genom webbläsaren än riktig beröring. Med CDP:s `Input.dispatchTouchEvent`, som Chromium gör om till pointer events precis som en telefon gör, fungerade det direkt. Buggen låg i testet, inte i appen.

**Kartan fyllde inte skärmen.** Ritytan är liggande 10:7, telefonen stående 1:2 — hela kartan rymdes i bredd och blev ett smalt band mitt på en svart skärm, med två tredjedelar av telefonen oanvänd. Nu zoomas den vid start så att höjden fylls, och man panorerar i sidled.

Den första versionen riktade mot ritytans geometriska mitt och landade i ett glest område. Startvyn siktar därför på tyngdpunkten, viktad efter antal öl per stil — där ölen faktiskt finns.

**Axelorden** kortas till ett ord på smal skärm. "sirapslimpa, pomerans, choklad" tog halva bredden; nu tar det bredaste 15 %.

**Kortet på telefon** glider upp underifrån och går att svepa ned igen. Svepet startar bara från greppet högst upp — tar man tag var som helst i kortet slåss svepet med rullningen, och då blir listan omöjlig att läsa.

**Hovern släppte inte.** En stil lyste kvar när pekaren gled ut i tomma rutan, eftersom bara svg-elementet hade en lämna-hanterare. Prickarna har nu en egen, villkorad på att det är just den stilen som är hovrad — då spelar det ingen roll i vilken ordning händelserna kommer när man går från en prick till nästa.

**Panoreringen hade inga gränser.** Man kunde dra ut i det svarta tills alla prickar försvann och inte hitta tillbaka. Nu får man dra 30 % av vyn förbi kartans kant, inte mer. Efter fem hårda drag i samma riktning finns 21 prickar kvar i bild.

---

## Formgivning

Motivet ger paletten: hela SRM-skalan från halmgult till nästan svart är redan appens färgsystem. Använd den som just det, och komplettera inte med en främmande accentfärg. Låt gränssnittet i övrigt vara nästan färglöst så att prickarna bär all kulör.

Bakgrunden ligger mitt på skalan — mörkt neutralt, inte svart. Mot svart försvinner imperial stout, mot vitt försvinner pilsner. Varje prick får dessutom en tunn ljus kant vars styrka följer mörkheten.

Kartan är sidans tes. Den ligger där direkt vid inladdning, i full storlek, utan hjältesektion eller ingress. Det som behöver förklaras förklaras genom att man rör vid den.

Copy på svenska, versal endast i meningsbörjan, aktiva verb. Knappen heter "Visa liknande", inte "Sök liknande produkter".

---

## Juridik

Appen presenterar och beskriver — den säljer inte. Inga köplänkar, inga affiliatelänkar, inga uppmaningar att dricka, ingen formulering som antyder att Systembolaget står bakom appen. Alkohollagens marknadsföringsregler gäller även en hobbysajt, och gränsen mellan redaktionellt innehåll och marknadsföring flyttar sig så fort ett köpflöde läggs till.

---

## Drift

Ligger på **[gokkan.github.io/olkartan](https://gokkan.github.io/olkartan/)**.

Publiceras till GitHub Pages av `.github/workflows/publicera.yml`, som körs vid varje push till `main` och söndagar 04:10. Arbetsflödet hämtar sortimentet, bygger datan, bygger appen och publicerar — ingen data behöver committas. Råfilen cachas med veckonumret som nyckel, så bara söndagsjobbet belastar källservern.

**Kartan tål att datan uppdateras.** Det var den verkliga risken med ett schemalagt bygge: PCA är deterministisk för samma indata, men när sortimentet ändras kan komponenterna rotera eller byta tecken, och då hoppar stilarna omkring för någon som lärt sig kartan. Testat genom att bygga om med 4 % av ölen borttagna:

```
median förflyttning per stil   0,015 spridningsenheter
största förflyttning           0,173   (Kölsch-stil)
kartans ytterkanter            oförändrade
```

Barley wine och Isbock ligger kvar längst till vänster, surölen längst till höger, och alla fem kontrollerna ger i praktiken samma värden. Teckenkonventionen i `egenvektorer()` — största laddningen alltid positiv — är det som hindrar spegelvändningar.

Bygget sätter `BASE` till `/<reponamn>/` eftersom ett projektsite ligger under en underkatalog. Appen hämtar produktdatan via `import.meta.env.BASE_URL` och följer med automatiskt.

## Kom igång

```bash
npm install
npm run data:hämta    # ~100 MB till data/rå/, hoppas över om filen är färsk
npm run data          # bygger datan, kör kontrollerna
npm run dev
```

Se [README.md](README.md) för kommandon och för hur repot kopplas till GitHub Pages första gången.
