# Utdelningsapp

Verktyg för svenska aktier med fokus på utdelning: följ din portfölj, jämför
totalavkastning, analysera utdelnings­gapet på x-dagen, och backtesta strategier.
Körs på **riktig data för hela Nasdaq Stockholm Large Cap** (~100 bolag, 8 års
historik) som uppdateras varje vardagkväll via GitHub Actions.

Projektet har två delar:

```
prototype/   Fristående webbapp (HTML/JS, ingen build) – läser data från prototype/data/
analysis/    Node-motor: hämtar kursdata (Yahoo), kör gap-analysen, exporterar till appen
```

## prototype/ – webbappen

Starta med `make frontend` (serverar mappen lokalt och öppnar webbläsaren),
eller hosta mappen statiskt (Cloudflare Pages / Netlify / Vercel). Fyra lägen:

- **Portfölj** – dina innehav i kronor: köp (antal + kurs), utdelning,
  återinvestering, med datum. Avkastning med/utan utdelning. Sparas lokalt.
- **Jämför** – "om du hade köpt för X kr datum D": alla aktier med utdelningar
  i kr och %, totalavkastning i kr och %, mot OMX. Klicka på en aktie för
  årlig utveckling och samtliga utdelningar.
- **Analys** – utdelnings-gap: hur ofta faller kursen ≥ utdelningen på x-dagen
  och hur snabbt fylls gapet. Sorterbar jämförelsetabell med utfall per 1 000 kr,
  filter (dir.avk, fyllnadsgrad, antal x-dagar) och detaljvy per x-dag.
  Ställbart fönster, öppning/stängning, mot index.
- **Strategi** – backtest på korgen som Analys-filtren väljer: behålla vs rotera
  vs index, efter courtage, räknat för ISK. Två urvalslägen: *dagens filter
  (facit)* och *årlig omscreening (out-of-sample)* – skillnaden mellan dem visar
  hur mycket urval-i-efterhand smickrar siffrorna.

Appen läser `prototype/data/analysis.json` + `series.json` (skrivs av
`analysis/src/export.js`). Saknas filerna (t.ex. vid `file://`) faller den
tillbaka på inbyggd exempeldata, tydligt märkt.

Ingen build, inga beroenden – det är en enda `index.html`.

## analysis/ – motorn för riktig data

Node-modul (Node 18+). Rådata cachas per aktie i `analysis/data/history/`
(committas i repot), så omkörningar hämtar bara svansen sedan sist.

```bash
cd analysis
npm test                                # motorns enhetstester (inget nät)
node src/cli.js --minYield 3 --basis index   # rankad tabell i terminalen
node src/export.js --cachedOnly --maxAge 24  # exportera till prototype/data/ offline
npm run validate                        # kolla att universumets tickers finns på Yahoo
```

Hela Nasdaq Stockholm Large Cap följer med i `analysis/data/universe.json`;
egna listor läggs till som nya nycklar i samma fil (`--universe <namn>`) eller
som textfil (`--list`). Se `analysis/README.md` för alla flaggor, cache,
datakällor och metodik. Genvägar: `make analyze`, `make validate`.

## Daglig uppdatering (GitHub Actions)

`.github/workflows/uppdatera-data.yml` kör varje vardag direkt efter
börsstängning (17:45 svensk tid, sommar- som vintertid): inkrementell hämtning → export → auto-commit av
`analysis/data/` + `prototype/data/`. Kan startas manuellt från Actions-fliken
("Run workflow"). Kör `git pull` lokalt för att få hem senaste datan.

## Roadmap

1. **Klart:** riktig data i alla flikar, daglig uppdatering via Actions,
   out-of-sample-backtest.
2. **Nästa:** deploya `prototype/` statiskt → appen i mobilen. `vercel.json`
   i repo-roten är förberedd: importera repot på vercel.com så serveras
   `prototype/` direkt, och varje datacommit från Actions deployar om sajten
   automatiskt. Ingen server, ingen databas krävs.
3. **Senare:** rotation med flera parallella positioner (dela kapitalet i N
   högar), och ev. molnsynk av portföljen när den ska sparas mellan enheter.

## Status

- `prototype/` – alla fyra lägen körs mot riktig data (93 utdelare av ~100
  Large Cap-bolag, 8 år); exempeldata endast som fallback.
- `analysis/` – motor, parser, cache-merge och filter verifierade med
  enhetstester (`npm test`); live-hämtning verifierad. Yahoo blockerar
  skript-klienter (429) från vissa nätverk – klienten växlar då automatiskt
  till headless Chrome som hämtare (se `analysis/README.md`, Datakälla).
