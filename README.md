# Ölkartan

En karta över Systembolagets ölsortiment där avstånd betyder smaklikhet.

**→ [gokkan.github.io/olkartan](https://gokkan.github.io/olkartan/)**

Projektets bakgrund, beslut och faser finns i [PLAN.md](PLAN.md). Det här dokumentet handlar bara om att köra och publicera.

## Kom igång

```bash
npm install
npm run data:hämta    # ~100 MB råsortiment till data/rå/ (hoppas över om filen är färsk)
npm run data          # bygger datan och kör kartans kontroller
npm run dev
```

`npm run data` måste köras minst en gång innan produktpanelen fungerar — `public/data/produkter.json` är 2,3 MB och ligger därför inte i repot.

## Kommandon

| | |
|---|---|
| `npm run dev` | utvecklingsserver |
| `npm run build` | produktionsbygge till `dist/` |
| `npm run data:hämta` | hämtar sortimentet. `-- --tvinga` hämtar även om filen är färsk |
| `npm run data` | bygger `stilar.json`, `meta.json`, `produkter.json` och kör kontrollerna |
| `npm run test:navigering` | acceptanstest för kartan, kräver att `npm run dev` kör |

## Datan

Källan är [susbolaget.emrik.org](https://susbolaget.emrik.org/v1/products), en communityspegel av Systembolagets öppna sortimentsdata som uppdateras dagligen 03:00. Den drivs av en privatperson — hämta sällan, och committa aldrig råfilen.

Byggskriptet kör fem kontroller som verifierar att kartan stämmer med hur öl faktiskt smakar: att stout hamnar skilt från IPA, att pilsner och helles ligger ihop, och så vidare. Går någon sönder säger skriptet till direkt.

Kartan är stabil mellan sortimentsuppdateringar. Ett test där 4 % av ölen togs bort flyttade stilarna 0,015 spridningsenheter i median, och kartans ytterkanter var oförändrade. Datan kan alltså uppdateras utan att kartan hoppar omkring för den som lärt sig den.

## Publicering

Appen publiceras till GitHub Pages av [arbetsflödet](.github/workflows/publicera.yml), som körs vid varje push till `main` och söndagar. Det hämtar sortimentet, bygger datan, bygger appen och publicerar — inget behöver committas.

Råfilen cachas med veckonumret som nyckel, så en vanlig push återanvänder den och bara söndagsjobbet hämtar på nytt.

### Sätta upp det första gången

```bash
gh auth login
gh repo create olkartan --public --source . --push
```

Slå sedan på Pages i repots inställningar: **Settings → Pages → Source: GitHub Actions**.

Repot är publikt eftersom GitHub Pages kräver Pro eller Team för att publicera från ett privat repo. Det gör ingen skada här: koden innehåller inga hemligheter, och datan är Systembolagets öppna sortiment.

Arbetsflödet sätter `BASE` till `/<reponamn>/` eftersom ett projektsite ligger under en underkatalog. Byter du reponamn eller flyttar till en egen domän följer bygget med automatiskt.

## Juridik

Appen presenterar och beskriver — den säljer inte. Inga köplänkar, inga affiliatelänkar, inga uppmaningar att dricka, ingen formulering som antyder att Systembolaget står bakom appen.
