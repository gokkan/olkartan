# Ölkartan

En webbapp som visar ölstilar som en karta där avstånd betyder smaklikhet. Man klickar sig in i en stil, ser produkter, och kan utgå från en öl man gillar för att hitta närliggande — med en förklaring av hur de skiljer sig.

Det här är andra utkastet. Det första byggde på ett antagande om datan som inte höll, och den korrigeringen ändrar tre av fyra faser.

---

## Vad som ändrades, och varför

**Ölen har tre smakklockor, inte fem.** Första utkastet räknade med `tasteClockBitter`, `Body`, `Sweetness`, `Fruitacid` och `Casque`. För öl är fruktsyra `0` hos samtliga 5 073 produkter, och strävhet och rökighet likaså. Fatkaraktär är i praktiken binär: 4 058 öl har värdet 1, bara 97 har mer. Kvar blir beska, fyllighet och sötma.

Det är inte tomma fält som någon glömt fylla i. `tasteClocks`, arrayen Systembolaget faktiskt publicerar per produkt, innehåller exakt tre poster för öl — `Bitter`, `Body`, `Sweetness` — och bara två uppsättningar förekommer i hela ölsortimentet: de tre, eller ingen alls. Fruktsyra, strävhet och rökighet är vinaxlar som ligger kvar som nollor i schemat. Det spelar roll längre ned: syran på kartan är därför en regel vi skrivit själva, inte ett värde vi läst av, och det är inte av lättja.

**Tre axlar räcker inte.** 4 160 öl med smakdata fördelar sig på 287 unika punkter. 337 öl delar exakt samma vektor. De tjugo vanligaste punkterna täcker 62% av sortimentet. En grannsökning i den rymden returnerar hundratals träffar på avstånd noll och svarar "nästan identisk smakprofil" på nästan varje fråga.

**PCA på bara klockorna ger ingen karta.** Alla fyra laddningarna på PC1 får samma tecken — axeln blir "hur stor är ölen", inte "hur smakar den". Torr porter och stout hamnade på samma prick som India pale ale. Första utkastet förutsåg att det kunde gå fel och rådde till att justera normaliseringen. Det rådet leder fel: ingen viktning skapar en rostningsaxel ur data som inte mäter rostning.

**Lösningen ligger i smaktexten.** Systembolagets `taste`-fält är mallskrivet och följer samma mönster hos 100% av ölen:

> `<karaktär>, <karaktär> smak med <styrka>, inslag av <A>, <B> och <C>.`

Det ger ett kontrollerat vokabulär på ungefär 30 karaktärsord (*maltig, humlearomatisk, rostad, syrlig, bärig*) och 288 smakdeskriptorer, varav 156 återkommer minst fem gånger (*kaffe, kavring, grapefrukt, tallbarr, banan*). Det är i praktiken ett färdigt smaklexikon, skrivet av folk som smakat ölen.

Med texten inräknad separerar rymden faktiskt. Måttet som säger något är avståndet till närmaste granne, som andel av avståndet mellan två slumpvis valda öl:

```
bara de tre klockorna                0 %    467 av 483 har en exakt dubblett
text + klockor + abv + syra         16 %     17 av 483 har en exakt dubblett
```

Att räkna unika vektorer vore ett svagare mått — två öl kan skilja sig på fjärde decimalen och ändå räknas som olika. Medianavståndet säger om rymden håller isär dem. Och stout hamnar där stout hör hemma.

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

**`VIKT_NUM = 0.6` är den känsligaste ratten**, men inte den enda. Den styr klockornas tyngd mot texten: höjs den suddas stout och IPA ihop igen — de har nästan identiska klockvärden och det är bara texten som skiljer dem — och sänks den tappar kartan sin koppling till beska och styrka.

De andra rattarna är `MIN_DF = 5`, åtta textkomponenter, divisorerna 10/12/11, alkoholtaket vid 15 %, syrans 0,7 och dess 40-teckenfönster. Och en som är lätt att missa för att den ser ut som en självklarhet: **standardiseringen av textkomponenterna**. Att vitna alla åtta till samma varians är ett val som ger PC8 samma tyngd som PC1, och det är samma sorts ratt som `VIKT_NUM` fast åt andra hållet. Se nedan.

**Vitning eller egenvärdesviktning?** Textkomponenterna skalas om innan de möter klockorna. Utan omskalning bestämmer PC1 nästan allt; med full vitning väger PC8 lika tungt som PC1. Invändningen mot vitning är att en trailing-komponent i en 152-dimensionell ordrymd mest är brus, och att förstärka den är att förstärka brus. Så ser spektret ut:

```
PC1 100%  PC2 85%  PC3 55%  PC4 41%  PC5 36%  PC6 34%  PC7 33%  PC8 32%
```

Det är platt. PC8 har en tredjedel av PC1:s varians, inte en femtiondel, så vitningen förstärker den med 1,8× — inte tio. Premissen håller alltså inte för just den här ordrymden, men frågan går inte att avgöra på resonemang. `VIKTNING=egenvarde` bygger den andra varianten.

Utfallet: kartorna korrelerar 0,95 på x och 0,94 på y, alla fem kontrollerna passerar i båda, och egenvärdesvarianten är marginellt bättre på alla fem. Men på fyra mått som *inte* är bland kontrollerna — och som därför inte kan smickra en ändring jag själv skulle vilja göra — är utfallet blandat:

```
                                          vitning   egenvärde
närmaste stilmitt är den egna, 13D          32,0 %      33,7 %
detsamma på kartans 2D                      15,6 %      15,9 %
stilarnas täthet (lägre är tätare)            3,72        3,84
kartan bevarar avstånden (13D ↔ 2D)          0,548       0,599
```

Två bättre, ett oförändrat, ett sämre. Medianstilen flyttar samtidigt 0,42 spridningsenheter — trettio gånger mer än en sortimentsuppdatering gör. **Vitningen får stå kvar.** Att flytta hela kartan för +0,05 i avståndstrohet är fel pris för den som lärt sig var stilarna ligger. Optionen och mätningen ligger kvar så att beslutet går att ompröva utan att göras om.

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
- **smakprofil över de tre riktiga axlarna** — beska, fyllighet, sötma. Ett radardiagram med tre hörn är en triangel och ser trasigt ut; använd tre vågräta staplar istället.

  Staplarna hade från början också ett streck för hela sortimentets median. Det ströks senare: medianen är 6, 6 och 2, alltså exakt samma tre lägen på varje kort man öppnar, och 43 av 60 stilar ligger inom ett klocksteg från den. Strecket satt i praktiken ovanpå stapeländen och sa ingenting. I produktvyn står kvar ett enda streck — stilens median — och det svarar på en riktig fråga: är den här ölen beskare än en typisk stout?
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

Molnet visar två saker som stilkartan döljer. Spridningen inom en stil varierar kraftigt: Berliner weisse ligger på 0,25 spridningsenheter i median, "Smaksatt/kryddad öl" på 1,29 — den senare är ingen smakstil alls utan en restkategori. Och de flesta öl ligger närmare någon annan stils mittpunkt än sin egen, med överlapp precis där gränsen är administrativ snarare än sensorisk: IPA mot New England IPA, tysk pilsner mot tjeckisk, övrig syrlig öl mot berliner weisse. Hur många beror på var man mäter, och skillnaden är själv värd att se:

```
i 13 dimensioner (hela smakrymden)   68 %
på kartans 2 dimensioner             84 %
```

68 % är påståendet om verkligheten. 84 % är vad man ser. De sexton procentenheterna emellan är vad projektionen kostar — kartaxlarna fångar 60 % av spridningen *mellan* stilar och ingenting av spridningen *inom* dem. Det är också därför likhetsmotorn räknar i 13D och inte på kartkoordinaterna.

Det är argumentet för att fas 3 ska räkna likhet mellan öl och inte mellan stilar.

**Rörelsen glider.** Hjulet flyttar bara ett mål; en animeringsslinga interpolerar vyn dit med exponentiell utjämning, tidskorrigerad så att glidet tar lika lång tid på 60 som på 144 hertz. Panorering går förbi utjämningen och följer fingret direkt — utjämnad panorering känns bara trög. En sökträff flyger in mot ölens egen koordinat, och en dragning avbryter inflygningen så att de inte slåss om vyn.

**Tre saker som skärmbilden avslöjade.** En imperial stout ritad i sin äkta SRM-ton har kontrast 1,03 mot bakgrunden — den försvann helt i smakprofilens staplar. Stapelfärgen är nu beskuren där kontrasten når 3:1. Det kostar nyans i den mörka änden, men färgen är dekor: datan ligger i längden och talet.

Molnets prickar hade samma problem av en annan orsak — en kant på 1,1 px runt en radie på 3,1 gör pricken till en ihålig ring oavsett fyllning. Geometrin är omvänd nu.

Och smaktexten följer inte alltid mallen: 34 öl skriver "rostad **öl** med inslag av …" eller "humlearomatisk **doft** med …". Parsern delade bara på ordet "smak", så för dem blev hela meningen ett karaktärsord och skräp som "rostad öl med inslag av pumpernickel" hamnade i termrymden. Efter rättningen föll antalet unika termer från 412 till 305, och kartans fem kontroller ger samma värden som förut.

## Fas 4 — genomgången, och mest struken ✅

Fyra punkter stod kvar. Tre av dem överlevde inte en ärlig genomgång.

**Permalänk ✅ klar.** Stod inte i planen alls, men var den största luckan: en app vars syfte är att visa någon något var inte delbar. Hela urvalet ligger nu i adressfältet — stil, öl, smakord och mat — och hashen är sanningen, inte en spegling av ett separat tillstånd. Det gör bakåtknappen gratis. En länk till en öl behöver inte bära stilen med sig; den framgår av ölen.

**Sök på smakord ✅ klar.** "Visa mig allt med kavring" ger 290 öl, koncentrerade i det mörka rostade hörnet: imperial porter 83, torr porter 68, brown ale 20, dunkel 15, schwarzbier 11. Kostade nästan ingenting att bygga — orden var redan utplockade för att kartan ska fungera.

**Sortimentsfilter ✅ klar — och senare struket, se nedan.** Tanken var en reparation, inte en bekvämlighet. Sju av tio öl finns bara lokalt eller på beställning:

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

**Panoreringen hade inga gränser.** Man kunde dra ut i det svarta tills alla prickar försvann och inte hitta tillbaka. Nu får man dra 30 % av vyn förbi innehållets kant, inte mer. Efter fem hårda drag i samma riktning finns 21 prickar kvar i bild.

Kanten var först ritytans, och det var fel. Stilarna spänner upp ritytan, men de är medelvärden — ölen ligger runt omkring dem, och 293 hamnar helt utanför den. Sökte man upp en av dem bad inflygningen om en förflyttning som gränsen klippte, och ölen landade utanför bild: den västligaste, Majornas Fyra Ett Fyra, hamnade på skärmposition −474 av 0–1000. Byggskriptet skriver nu produkternas ytterkanter till `meta.utbredning`, och gränsen mäts mot unionen av dem och ritytan. Ett test i `testa-karta.mjs` plockar de fyra ytterligheterna ur datan och kontrollerar att var och en hamnar i bild.

**Uppåtpilen låg under sökrutan.** Sökrutan är 340 px bred, alltså nästan skärmbred på telefon, och ligger i övre vänstra hörnet med `z-index: 5`. Axeletiketten "↑ örter" är centrerad 14 px från toppen och hamnade rakt under den. Den flyttas ned under sökrutan på smal skärm. Ett test i `testa-mobil.mjs` mäter numera att rutorna inte överlappar, för det var inget man såg i en skärmbild av kartan — bara i en skärmbild av telefonen.

---

## Mat, och ett filter som ströks

**Sortimentsfiltret är borttaget.** Det byggdes för att sju av tio öl bara finns lokalt eller på beställning, och tanken var att slippa rekommendationer man inte kan handla. Efter dubblettsammanslagningen är "Fast sortiment" 365 öl av 3 375 — kryssar man i rutan försvinner nio av tio prickar och kartan blir en annan, glesare karta. Det är ett för stort ingrepp för en kryssruta, och fel avvägning för en app som beskriver snarare än säljer: det lokala sortimentet är just där de intressanta ölen finns. Hela `fast`-nyckeln är ute ur hashen och ur `Läge`.

**Matmatchning ✅ klar.** `tasteSymbols` finns på 3 371 av 3 375 öl och är det enda fältet i katalogen som säger något om ölen som kartan inte redan vet — kartan bygger på smaktexten, det här på vad någon på Systembolaget tycker att ölen passar till.

```
Sällskapsdryck 3 158   Nöt      1 327   Vilt        191
Fläsk          1 906   Grönsaker 1 206   Skaldjur    151
Lamm           1 641   Fågel       907   Buffémat    137
Fisk             597   Ost         110   Kryddstarkt 107
Aperitif          67   Dessert      73   Asiatiskt    11
```

Den ligger **utanför** kartan med flit. Matchningen är grov — nio av tio öl är märkta "sällskapsdryck" — och att väga in den skulle dra ihop stilar som inte smakar lika. Smaktexterna är fortfarande enda grunden för avstånd.

I gränssnittet är maten ett urval av samma slag som ett smakord: sökbar, klickbar från produktvyn, och den lyser upp sitt moln på kartan. Vyerna delar komponent (`Urval.tsx`) men inte påstående — noten i matvyn säger var siffrorna kommer ifrån, för matmolnet behöver inte följa kartan. "Fisk" råkar samla sig i det ljusa hörnet, "sällskapsdryck" ligger överallt.

Ett urval är en ram runt bläddrandet, inte en återvändsgränd. Klickar man på en öl i listan tar ölen över panelen, men `mat=Fisk` ligger kvar i adressen: molnet på kartan fortsätter visa fiskölen, den valda pricken lyser, och tillbakalänken heter "← fisk". Följer man därifrån en liknande öl behålls ramen så länge ölen också är märkt för fisk. Är den inte det har man lämnat urvalet, och då byter panelen till ölens stil — att stå kvar i "fisk" med en öl som inte hör dit vore en lögn om vad man tittar på.

Stilvyn visar de rätter stilen passar till *oftare än sortimentet i stort*, inte de vanligaste — annars hade det stått "sällskapsdryck" på alla 60 stilarna.

**Etikettbilder ✅ klara.** `product-cdn.systembolaget.se/productimages/<id>/<id>_200.png` — även `_100` och `_400`; utan storlekssuffix svarar servern 404. Adressen räknas ut ur artikelnumret, så ingenting behöver lagras utom en flagga för de 55 öl som saknar bild.

Bilden är en bonus, aldrig en del av panelens form. Vi äger inte länken: ändrar Systembolaget sökvägen slocknar bilderna, och då ska panelen se ut precis som den gjorde innan de fanns. Två spärrar ser till det — `bild`-flaggan ur katalogen slipper anropet helt, och `onError` plockar bort elementet om det ändå går fel. Ingen platshållarruta, ingen bruten bildikon. Ett test i `testa-lankar.mjs` svarar 404 på alla bildanrop och kontrollerar att panelen är hel.

---

## Kartan på telefon

**Texten gick inte att läsa.** Ritytan är 1000×700 och skalas in med `meet`, efter den knappaste sidan. Bredvid en öppen panel på en 1440-skärm blir en ritenhet 1,06 skärmpunkter — på en 412 punkter bred telefon 0,41. Elva punkters text ritades alltså ut som fyra.

`lupp` räknar upp de mått som ska hålla sin storlek på skärmen. Referensen är skrivbordsläget, så där blir faktorn ett och ingenting ändras; på telefon blir den tre. Faktorn följer elementets storlek via en `ResizeObserver`, inte en mediefråga — det som avgör hur smått allt blir är hur många punkter ritytan får, och den krymper också när panelen tar plats bredvid.

Prickarna följer luppen bara till 60 %. Full uppräkning gav en karta som var en samling bollar: en text under elva punkter går inte att läsa, men en prick på tio går utmärkt att träffa. Stilprickarna har dessutom ett golv på sju punkter, så att en stil med tre öl går att peka på; molnets prickar får inte det, för fyrahundra öl med fingerstora prickar blir en enda klump.

Resultatet är att telefonen visar samma sak som skrivbordet i samma storlek — alltså en mindre bit av kartan, med 30–40 läsbara namn i stället för 60 oläsliga. Det är avvägningen: en 412 punkter bred skärm rymmer inte sextio utsatta stilar, och då är panorering ett ärligare svar än att krympa texten.

**Kortet täckte skärmen.** Panelen delade höjden med kartan och tog 55 %. Nu ligger den ovanpå kartan i stället, i två lägen: vid första trycket kommer den upp precis så långt att rubriken syns — 146 punkter, och 459 prickar ligger kvar ovanför — och drar man i greppet fälls resten upp. Drar man ned från kikläget stängs den. Ett tryck på greppet växlar, för den som inte förstår att kortet går att dra.

Kikhöjden mäts fram ur innehållet i stället för att gissas: vyerna märker ut sin sista rubrikrad med `data-kik`, och kortet öppnas så långt plus 34 punkter. Ett ölnamn i två rader får mer plats än ett i en, och flaskbilden räknas med — `ResizeObserver` lyssnar på rubrikstycket och inte bara på kortet, för bilden kommer över nätet och skjuter ned resten när den landar.

De 34 extra punkterna är hela poängen med att inte sluta vid en kant. Slutade kiket snyggt efter rubriken såg kortet färdigt ut, och då fanns ingen anledning att dra i det. Nu klipps nästa rad av under en toning — avklippet blir ett budskap i stället för ett slarvfel. Handtaget är dessutom två streck som vinklas till en flack pil uppåt i kikläget och lägger sig platta när kortet är uppfällt.

Och man behöver inte hitta handtaget: ett tryck var som helst på kortet fäller upp det. I kikläget är innehållet under rubriken avstängt för pekaren, så den halva knapp som sticker upp ur kiket inte går att utlösa av misstag — trycket fäller upp kortet i stället.

---

## Vin: samma pipeline, tre kartor

Frågan var om grunden bär mer än öl. Den gör det — men inte utan tre beslut som inte går att kopiera rakt av.

**Underlaget är bättre än ölens.** 4 109 viner har smaktext mot ölens 4 160, samma mall (98 % innehåller "smak", 100 % "inslag av"), rikare ordförråd: 351 unika termer mot 305, och 7,7 termer per vin mot 6. Att bara 26 % av vinerna har text är en missvisande siffra — täckningen är strukturerad, inte slumpmässig:

```
Fast sortiment        1 776 av 1 778   100 %
Lokalt & Småskaligt     256 av   257   100 %
Tillfälligt sortiment 1 063 av 2 239    47 %
Ordervaror              989 av 11 189    9 %
```

Det handlagda sortimentet är fullständigt beskrivet. De 11 189 ordervarorna är den långa svansen av importviner som ingen har i hyllan.

**Och klockorna fungerar.** Det som var ölets stora problem är vinets styrka: fruktsyra och strävhet, axlarna som ligger döda för öl, är levande här. Rött mäts på fyllighet, strävhet och fruktsyra; vitt på sötma, fyllighet och fruktsyra.

**Därför två vinkartor, inte en.** Rött har strävhet där vitt har sötma. Det är inte samma axel, och att lägga dem i en gemensam rymd skulle kräva att den saknade räknas som noll — alltså påstå att alla röda viner är osöta. Det var precis felet i ölplanens första utkast, och det gör man inte om.

**Druvan, inte kategorin.** Vinets `categoryLevel3` är redan en smakklassning: "Fruktigt & Smakrikt", "Kryddigt & Mustigt", "Torrt vitt". Att aggregera på den vore cirkulärt — smakhärledda positioner mot smakhärledda kategorier. Druvan är den ärliga enheten, och den finns på 73 % av vinerna.

**Ett vin kan ha flera druvor.** En öl har en stil, men en Bordeaux är cabernet *och* merlot, och båda druvorna räknar vinet som sitt. Gruppen är därför en lista i datamodellen, inte ett värde. Det gjorde `stil: string` till `grupper: string[]` genom hela appen.

**En druva med två viner är ingen druva på kartan** utan ett vin med en etikett, och dess mittpunkt är vinets egna egenheter. Öl klarar gränsen ett — tre av sextio stilar är små. Vin gör det inte: sextio av hundrafyrtio druvor har färre än fem viner. Gränsen är fem. Vinet självt kastas däremot inte när dess druvor faller bort — se nästa avsnitt.

### Kontrollerna, och en som hade fel

```
RÖTT                                            VITT
✓ shiraz och syrah är samma druva     0,29      ✓ vinho verde-druvorna ligger ihop     0,23
✓ bordeauxparet ligger ihop           0,52      ✓ chardonnay skild från riesling       1,05
✓ rhôneparet ligger ihop              0,55      ✓ chardonnay närmare chenin            0,33
✓ burgund skild från cabernet         3,65      ✓ sauvignon blanc inte bland de fylliga 1,22
✓ nebbiolos strävhet syns             2,73
```

Shiraz mot Syrah är den bästa kontrollen i hela projektet: det är samma druva under två namn, så hamnar de inte ihop är det kartan som är trasig och inte min uppfattning om vin.

En kontroll föll och blev struken. Jag hade skrivit att sauvignon blanc och grüner veltliner skulle ligga ihop, för att båda är "gröna och syrliga". Kartan sa 1,28 och den har rätt: Systembolaget mäter grüner veltliner som fylligare och mindre syrlig, och kartans grannar till sauvignon blanc — alvarinho och loureiro, båda vinho verde-druvor — är mer övertygande än min tumregel. Kontrollen var fel, inte kartan.

Kartorna klarar också ögat. Bordeauxfamiljen ligger samlad i ena hörnet, rhônefamiljen i det andra, hela den italienska familjen — nebbiolo, sangiovese, corvina, barbera, dolcetto — för sig, och pinot noir ensam längst upp med gamay som närmaste granne.

### Vad som blev generellt

Byggskriptet tar nu en dryckesdefinition ur `scripts/drycker.mjs` och kör samma pipeline en gång per karta. Det som är dryckspecifikt står samlat där: urvalet, vad en grupp är, vilka klockor som finns och deras maxvärden, färgorden, dubblettnyckeln, och kontrollerna. Resten — parsern, tf-idf, PCA, teckenkonventionen, dubblettsammanslagningen, luppen, panoreringsgränserna — är gemensam.

Appen bytte `stil` mot `grupp` genomgående och läser klockaxlarna ur kartan i stället för att ha dem inbyggda. Grupperna för alla tre kartorna byggs in (100 kB), så kartan målas direkt oavsett vilken man öppnar; produktfilerna hämtas var för sig och bara den man tittar på.

### En dubblett som gömde sig i ett NUL-tecken

Ölen gick från 3 375 till 3 374 i omskrivningen, och det tog en stund att förstå varför. Den gamla dubblettnyckeln fogade ihop namnfälten med en NUL-byte mellan sig — ett osynligt tecken som dessutom fick `grep` att kalla filen binär (och som en gång följde med in i den här filen, vilket gjorde samma sak med den). Med NUL emellan är "Stigbergets" + "Amazing Haze IPA" och "Stigbergets Amazing Haze" + "IPA" två olika nycklar. Det är samma öl; Systembolaget har bara delat namnet olika i de två artiklarna. Nyckeln fogas nu ihop med mellanslag, vilket jämför det visade namnet i stället för fältuppdelningen, och dubbletten försvann.

---

## Ett vin utan druva är fortfarande ett vin

Farmers Market Organic står i hyllan för 89 kronor, har en smaktext och tre smakklockor — och gick inte att söka upp. Fältet `grapes` är tomt. Systembolagets egen sida skriver "Negroamaro, primitivo och övriga druvsorter" under Råvaror, men den texten finns inte i katalogdatan, och druvkartan kastade allt som saknade druva.

Det gällde 375 viner med smaktext, var sjätte: 245 röda och 130 vita. Plus 24 öl utan `categoryLevel3`. Formuleringen "vi vet inte vad det här är" var appens svar på frågan "var ligger den?" — men appen visste var den låg. Placeringen kommer ur smaktexten, inte ur druvan.

**Två åtgärder, i den ordningen.**

*Läs druvan på etiketten.* "Grand Sud Merlot", "Famille Audu Chardonnay", "Black Stallion Napa Valley Cabernet Sauvignon" — druvan står på flaskan även när fältet är tomt. Ordförrådet byggs ur de viner som *har* fältet ifyllt, så listan är Systembolagets egen och inte min. Det räddar 63 viner, och gav vitvinskartan en druva till: Moscato passerade fem.

*Låt resten ligga kvar utan grupp.* De ingår i termrymden och PCA:n — de är röda viner, beskrivna med samma ordförråd, och det finns inget smakskäl att utesluta dem — men de drar inte i någon druvas mittpunkt och syns inte i någon druvas lista. Öppnar man ett står det rakt ut att druvan inte är angiven, och staplarna visas utan medianmarkör eftersom det inte finns någon median att jämföra med.

```
        före            efter
öl      3 374 öl        3 395   varav 21 utan stil
rött    1 156 viner     1 445   varav 263 utan druva
vitt      758 viner       967   varav 181 utan druva
```

**En dubblett som åt en druva.** Rödvinskartan tappade en druva så fort de druvlösa vinerna fick vara kvar. Samma vin ligger ofta under två artikelnummer, och representanten väljs på om vinet går att köpa — inte på hur välskött posten är. Nu kunde den tomma posten vinna och druvan försvann med den. Druvan hör till vinet, inte till artikelnumret, så dubbletterna unionerar sina grupper. 52 druvor igen.

**Vinkartorna roterade.** 25 % fler viner i termrymden ger nya huvudkomponenter. Avståndskorrelationen mot den gamla kartan är 0,96 och alla fjorton kontroller går igenom med oförändrade marginaler, men var fjärde närmaste-granne-relation ändrades i utkanterna och varje druva flyttade sig — medianen 1,9 spridningsenheter, vilket nästan uteslutande är rotationen. Ölkartan rörde sig 0,005: 21 nya öl av 3 395 ändrar ingenting. Grannlistorna efteråt är om något bättre: cabernet sauvignon → tannat, malbec, cabernet franc, merlot; grenache → cinsault, grenache noir, mourvèdre; gewürztraminer → torrontés, pinot gris, muscat.

**Whisky — nej, inte som karta.** 467 med smaktext, en enda klocka (rökighet), och framför allt ingen nivå att aggregera på: `categoryLevel3` är maltwhisky 315, blended 95, bourbon 31 och sedan ensiffrigt. En karta med tre användbara prickar är ingen karta. Regionen räcker inte heller — 248 av 467 saknar den. Det whisky skulle kunna bli är ett moln utan stillager, en spridningsbild av 467 flaskor. Det är en annan produkt.

---

## Nära på kartan är inte samma sak som lika

Frågan kom från användning: två prickar ligger ovanpå varandra — betyder det att de hamnar på varandras "Liknande"-listor? Nej, och mycket mer sällan än man tror.

Listan räknar avstånd på **hela vektorn** — åtta textkomponenter, klockorna, alkoholhalten. Kartan visar två dimensioner. Eftersom kartaxlarna är ortonormala är kartavståndet exakt *den del* av det verkliga avståndet som ligger i planet, så andelen går att mäta rakt av i stället för att uppskattas:

```
             grupperna   enskilda produkter
öl              73 %           42 %
rött            67 %           47 %
vitt            67 %           46 %
```

För 300 slumpade öl: den granne som ligger närmast **på kartan** har medianrang 395 av 3 395 i smakrymden, och finns i topp 6-listan i 8 % av fallen. Åt andra hållet har listans sex närmaste medianrang 90 på kartan.

Värsta uppmätta paret:

```
kartavstånd 0,013   (ett typiskt par ligger 1,69 isär — 0,8 %)
rang i smakrymden 3 390 av 3 395

Götaälvdalens Gotha Elf Krabaten   Session IPA          6/6/2  5,2 %
  "Fruktig smak med inslag av ananas, mango, örter, ljust bröd och grapefrukt."
O/O Brewing Ekta Pils              Pilsner - tysk stil  6/5/1  5,2 %
  "Maltig smak inslag av ljust knäckebröd, färska örter och citrusskal."
```

Samma punkt, och näst intill det mest olika ölet i sortimentet. Klockorna är nästan identiska, så de axlarna tar ut varandra, och kartans plan råkar ligga så att "fruktig humle" och "maltig bröd" gör detsamma. Deras skillnad är till 99,99 % vinkelrät mot skärmen. 75 av 300 öl hade en sådan granne närmare än 0,02.

Det är inte en bugg utan priset för två dimensioner, och valet att räkna listan i hela rymden är rätt just därför. Men kartan lovade mer än den höll, så nu står det i appen — en i-knapp vid kartvalet öppnar `Om.tsx`, som förklarar hela kedjan från smaktext till plats och avslutar med vad kartan *inte* visar.

Varje tal i den texten hämtas ur kartans metadata. `synligAndel` och `antalTermer` räknas fram i bygget just för det: en text som påstår "42 %" måste räknas om när rattarna ändras, annars ljuger den tyst. Gränssnittstestet läser talen ur meningarna och larmar om någon lucka blir tom.

### Och ett 3D-läge, som bara går att titta på

Nästa fråga var om ett roterbart moln skulle vara mer rättvisande. Första svaret blev nej, men det svarade på fel fråga: en *slumpad* kameravinkel visar 41 % mot kartans 42 %, eftersom PCA redan valt ut den bästa möjliga 2D-vyn. Med fri rotation är det inte en vinkel man får utan alla, över tid.

Den rätta frågan är om det man missar går att vrida fram. För de par som ligger på varandra men smakar olika:

```
                falska grannar   PC3-glapp    glider synligt isär
                  av 300          (median)      vid rotation
öl                   75            0,66          60 st  (80 %)
rött                 36            0,82          24 st  (67 %)
vitt                 14            0,47           8 st  (57 %)
```

Fyra av fem avslöjas. Värsta paret — Gotha Elf mot Ekta Pils, 0,013 isär i bild — har ett PC3-glapp på 1,96 mot ett typiskt avstånd på 1,65, alltså mer än en hel karta isär så fort man vrider. Med tre axlar går närmaste grannens smakrang från median 393 till 89.

Taket sitter ändå lågt: PC3-glappet är bara 23 % av deras verkliga skillnad, och var femte falsk granne ligger ihop från varenda vinkel. Rotationen säger *att* två prickar bedrar en, inte *hur mycket*.

**Man kan bara titta.** Det är villkoret som gör läget rimligt. Utan träffytor försvinner djupsorterad träffprövning, etiketter som måste räknas om varje bildruta, och en tredje gest på telefonen. Kvar blir ett moln som snurrar av sig självt tills man tar tag i det.

**Prickarna ensamma går inte att orientera sig i.** De ser likadana ut från varje håll, så man vet varken vad som är upp eller hur långt man vridit. Ett golv med rutnät under molnet löser det: det ligger i planet för de två axlar man känner igen från den platta kartan, så det nya är höjden. Golvet läggs vid molnets egen underkant och inte vid sfärens botten — molnet är platt i höjdled, och mot sfären skulle prickarna sväva långt över sitt golv. Rutnätets sida hålls innanför R/√2, för en kvadrats hörn ligger √2 gånger längre ut än dess sida och stack annars utanför bild när golvet vreds. Den valda pricken får en lodlinje ned till golvet med en fot där den landar; det enda strecket är vad som gör höjdled läsbar.

Vridningen sker kring **tyngdpunkten**, inte kring lådans mitt. Lådans mitt ger den minsta omslutande sfären och alltså det största molnet, men prickarna ligger ojämnt: den täta delen skulle svepa fram och tillbaka över skärmen medan man vrider, vilket är precis det som gör en roterande vy svår att följa. Med tyngdpunkten som nav står tätheten stilla och ytterkanterna rör sig.

Två saker skiljer det från den platta kartan. **Skalan är enhetlig på alla tre axlarna** — den platta kartan sträcker x mot y för att fylla rutan, och för rött vin är sträckningen 1,85 gånger, men ett moln som deformeras när det vrids ljuger om varje avstånd utom de två man råkar titta rakt på. Och **sfären fyller elementets kortaste led, inte ritytans**: utan den mätningen blev molnet en femtedel av en telefonskärm.

Testet mäter det som är läget värt: ta de två stilar som ligger närmast varandra, vrid ett kvarts varv, mät igen. Dortmunder och Zwickel går från 2 px till 145 px av ett typiskt avstånd på 196. Går de inte isär gör läget ingen nytta.

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

**Första söndagskörningen hämtade ingenting.** Den lyckades, publicerade och såg riktig ut — men loggen sa `Cache hit for: sortiment-2026-32` och `kör med --tvinga för att hämta ändå`, alltså exakt samma data som gårdagens pushar. Isoveckor börjar på måndag, så söndagen är veckans *sista* dag och delar nyckel med varje push sedan måndagen. Ett schemalagt jobb vars enda uppgift är att hämta nytt satt alltså och läste sin egen veckas cache.

Nu läser det schemalagda jobbet inte cachen alls, och sparar under *nästa* veckas nyckel — den vecka pushar kommer att fråga efter. Pushar läser med `restore-keys` som fallback, så en miss kostar en gammal fil i stället för 100 MB. Manuell körning räknas som schemalagd: trycker man på knappen vill man ha färsk data, annars hade man pushat.

Sensmoralen är värd att skriva ned: ett grönt bygge betyder att stegen gick igenom, inte att de gjorde vad de var till för. Det syntes bara i loggen.

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
