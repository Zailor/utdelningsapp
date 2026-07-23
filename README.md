# Utdelningsapp

Verktyg för svenska aktier med fokus på utdelning: följ din portfölj, jämför
totalavkastning, analysera utdelnings­gapet på x-dagen, och backtesta strategier.

Projektet har två delar:

```
prototype/   Fristående webbapp (HTML/JS, ingen build) – UI:t med exempeldata
analysis/    Node-motor som kör analysen mot riktig svensk data (Yahoo)
```

## prototype/ – webbappen

Öppna `prototype/index.html` i en webbläsare (eller hosta mappen statiskt, t.ex.
Cloudflare Pages / Netlify / Vercel). Fyra lägen:

- **Portfölj** – dina innehav i kronor: köp (antal + kurs), utdelning,
  återinvestering, med datum. Avkastning med/utan utdelning. Sparas lokalt.
- **Jämför** – totalavkastning i % per period, aktie mot aktie.
- **Analys** – utdelnings-gap: hur ofta faller kursen ≥ utdelningen på x-dagen
  och hur snabbt fylls gapet. Ställbart fönster, öppning/stängning, mot index.
- **Strategi** – backtest: behålla vs rotera vs index, equity-kurvor + statistik,
  räknat för ISK.

> Analys- och Strategi-flikarna använder **exempeldata** (tydligt märkt i appen).
> De finns för att spika metod och vy innan riktig data kopplas in via `analysis/`.

Ingen build, inga beroenden – det är en enda `index.html`.

## analysis/ – motorn för riktig data

Node-modul (Node 18+) som hämtar riktiga kurser + utdelningar från Yahoo och kör
gap-fill-analysen. Kör lokalt (kräver öppen internetuppkoppling):

```bash
cd analysis
npm test                                # motorns enhetstester (inget nät)
node src/cli.js --minYield 3 --basis index
npm run validate                        # kolla att universumets tickers finns på Yahoo
```

Hela Nasdaq Stockholm Large Cap (~100 bolag) följer med i
`analysis/data/universe.json`; egna listor läggs till som nya nycklar i samma
fil (`--universe <namn>`) eller som textfil (`--list`). Se `analysis/README.md`
för alla flaggor, datakällor och metodik. Genvägar: `make analyze`,
`make validate`.

## Så hänger delarna ihop (roadmap)

1. **Nu:** prototypen visar UI + metod med exempeldata; motorn räknar riktig
   gap-analys i terminalen.
2. **Nästa:** ett schemalagt jobb (t.ex. GitHub Actions) kör motorn dagligen och
   skriver `analysis.json`; prototypens Analys/Strategi-flikar läser den filen i
   stället för exempeldata. Deploya `prototype/` statiskt → appen i mobilen med
   riktig data. Ingen server, ingen databas krävs för v1.
3. **Senare:** backtest-motor (`analysis/src/backtest.js`) med out-of-sample, och
   ev. molnsynk av portföljen (managed Postgres) när du vill spara den mellan
   enheter.

## Status

- `prototype/` – fungerar; verifierad i webbläsare (alla fyra lägen).
- `analysis/` – motor + parser + filter verifierade (enhetstester, `npm test`);
  live-hämtning mot Yahoo verifierad med riktig data. Yahoo blockerar numera
  skript-klienter (429) från vissa nätverk – klienten växlar då automatiskt
  till headless Chrome som hämtare (se `analysis/README.md`, Datakälla).

Exempeldatans *nivåer* är inte verkliga – *mönstren och metoden* är poängen tills
riktig data är inkopplad.
