# Ölkartan

Systembolagets ölsortiment som en karta, där avstånd betyder smaklikhet. Positionen räknas fram ur Systembolagets egna smakbeskrivningar — 3 375 öl i 60 stilar. Sök på en öl du gillar och se vad som ligger bredvid, eller klicka dig runt. Allt du väljer hamnar i adressfältet, så länken går att skicka vidare.

**→ [gokkan.github.io/olkartan](https://gokkan.github.io/olkartan/)**

Hur kartan räknas fram, och varför den ser ut som den gör, står i [PLAN.md](PLAN.md).

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

`npm run data` måste köras minst en gång innan produktpanelen fungerar — `public/data/produkter.json` är 2,3 MB och ligger inte i repot.

## Kommandon

| | |
| --- | --- |
| `npm run build` | produktionsbygge till `dist/` |
| `npm run data` | bygger om `stilar.json`, `meta.json` och `produkter.json` |
| `npm test` | enhetstester för likhetsmotorn, körs i deployen |
| `npm run test:karta` m.fl. | gränssnittstester, se `package.json` |

Gränssnittstesterna kräver att `npm run dev` kör i en annan terminal, plus Playwright (`npm i --no-save playwright && npx playwright install chromium`). Den ligger med flit utanför `package.json` — 200 MB webbläsare hör inte hemma i ett bygge. Kör dem för hand när du rört kartan, panelen eller sökningen.

## Publicering

GitHub Pages, via [arbetsflödet](.github/workflows/publicera.yml) vid varje push till `main` och söndagar 04:10. Det hämtar sortimentet, bygger datan, bygger appen och publicerar — inget behöver committas. Slå på **Settings → Pages → Source: GitHub Actions** en gång, så sköter det sig själv.

## Juridik

Appen presenterar och beskriver — den säljer inte. Inga köplänkar, inga affiliatelänkar, inga uppmaningar att dricka, ingen formulering som antyder att Systembolaget står bakom appen.
