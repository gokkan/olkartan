# Smakkartan

Systembolagets sortiment som kartor, där avstånd betyder smaklikhet. Positionen räknas fram ur Systembolagets egna smakbeskrivningar. Sök på något du gillar och se vad som ligger bredvid, eller klicka dig runt. Allt du väljer hamnar i adressfältet, så länken går att skicka vidare.

```
öl      3 395 öl     60 stilar
rött    1 445 viner  52 druvor
vitt      967 viner  39 druvor
```

Tre kartor och inte en: rött och vitt vin mäts med olika smakklockor — rött har strävhet, vitt har sötma — och att lägga dem i samma rymd skulle kräva att den saknade axeln räknas som noll. Öl grupperas på stil, vin på druva. Vinets egen kategorinivå är redan en smakklassning ("Fruktigt & Smakrikt"), så att aggregera på den vore cirkulärt.

Grupperna är prickarna, men en dryck utan grupp finns ändå med. Var sjätte vin har tomt druvfält hos Systembolaget; det placeras på kartan ändå, för det är smaktexten som bestämmer platsen.

I-knappen vid kartvalet förklarar hela kedjan, inklusive vad kartan inte visar: två dimensioner räcker till 73 % av skillnaden mellan två stilar men bara 42 % mellan två enskilda öl. Därför räknar "Liknande" på hela smakprofilen och inte på avståndet i bild.

3D-knappen visar en tredje riktning som molnet går att vrida runt. Fyra av fem drycker som ligger på varandra i den platta bilden glider isär så fort man vrider. Där går det bara att titta — tillbaka till 2D för att välja något.

**→ [gokkan.github.io/olkartan](https://gokkan.github.io/olkartan/)**

Hur kartorna räknas fram, och varför de ser ut som de gör, står i [PLAN.md](PLAN.md).

## Tack

Datan kommer från [susbolaget.emrik.org](https://susbolaget.emrik.org/v1/products), en communityspegel av Systembolagets öppna sortimentsdata som uppdateras varje natt. Den drivs och betalas av en privatperson. Utan den hade det här projektet börjat med att skrapa en webbsida — tack.

Det medför en skyldighet: hämta sällan. `npm run data:hämta` hoppar över hämtningen om den lokala filen är yngre än sju dygn, veckojobbet cachar råfilen på veckonummer, och råfilen ligger inte i repot.

## Kom igång

```bash
npm install
npm run data:hämta   # ~100 MB råsortiment till data/rå/  (-- --tvinga hämtar ändå)
npm run data         # bygger datan och kör kartans kontroller
npm run dev
```

`npm run data` måste köras minst en gång innan produktpanelen fungerar — produktfilerna i `public/data/` är flera megabyte och ligger inte i repot. Vad som skiljer kartorna åt står samlat i [scripts/drycker.mjs](scripts/drycker.mjs); resten av pipelinen är gemensam.

## Kommandon

| | |
| --- | --- |
| `npm run build` | produktionsbygge till `dist/` |
| `npm run data` | bygger om alla tre kartorna. `DRYCK=rott` bygger bara en |
| `npm test` | enhetstester för likhetsmotorn, körs i deployen |
| `npm run test:karta` m.fl. | gränssnittstester, se `package.json` |

Gränssnittstesterna kräver att `npm run dev` kör i en annan terminal, plus Playwright (`npm i --no-save playwright && npx playwright install chromium`). Den ligger med flit utanför `package.json` — 200 MB webbläsare hör inte hemma i ett bygge. Kör dem för hand när du rört kartan, panelen eller sökningen.

## Publicering

GitHub Pages, via [arbetsflödet](.github/workflows/publicera.yml) vid varje push till `main` och söndagar 04:10. Det hämtar sortimentet, bygger datan, bygger appen och publicerar — inget behöver committas. Slå på **Settings → Pages → Source: GitHub Actions** en gång, så sköter det sig själv.

## Juridik

Appen presenterar och beskriver — den säljer inte. Inga köplänkar, inga affiliatelänkar, inga uppmaningar att dricka, ingen formulering som antyder att Systembolaget står bakom appen.
