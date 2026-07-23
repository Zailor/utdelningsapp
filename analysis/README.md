# Utdelningsanalys (gap-fill)

Hittar svenska aktier vars kurs faller **minst lika mycket som utdelningen** på
x-dagen, och mäter **hur många handelsdagar** det tar innan kursen är tillbaka på
nivån före. Rankar aktierna efter hur ofta gapet fylls – "mer eller mindre
garanterat" uttryckt som en frekvens, inte ett löfte.

Det här är analysmotorn för steg 2 (den skarpa versionen av testprototypen).

## Status

| Del | Läge |
|---|---|
| Analysmotor (`src/gapfill.js`) | ✅ Verifierad – enhetstester (`npm test`) |
| Yahoo-parser (`src/yahoo.js` · `parseChart`) | ✅ Verifierad mot Yahoo-format i test |
| Live-hämtning (`fetchChart` + `cli.js`) | ✅ Verifierad mot riktig Yahoo-data (via headless Chrome-fallback vid 429, se Datakälla) |
| Universum `large-cap` (`data/universe.json`) | ✅ Hela Nasdaq Stockholm Large Cap, tickers verifierade med `npm run validate` |

## Kör

Kräver Node 18+ och en **öppen internetuppkoppling** (Yahoo blockeras i låsta
CI-/sandlådemiljöer).

```bash
cd utdelningsanalys
npm test                     # kör motorns enhetstester (inget nät krävs)

node src/cli.js                                 # large-cap, 40 dagar, fall@öppning, nominellt
node src/cli.js --universe demo --basis index
node src/cli.js --minYield 3                    # bara aktier med dir.avk >= 3%
node src/cli.js --minEvents 4 --years 10        # kräver >= 4 x-dagar för att rankas
node src/cli.js --list mina-aktier.txt          # egen lista (en ticker per rad)
node src/cli.js --symbol INVE-B.ST
```

### Flaggor

| Flagga | Val | Default | Betydelse |
|---|---|---|---|
| `--window` | t.ex. `20`, `40`, `60`, `90` | `40` | Antal handelsdagar som "återhämtat" får ta |
| `--dropAt` | `open` \| `close` | `open` | Om fallet mäts på öppnings- eller stängningskurs på x-dagen |
| `--basis` | `nominal` \| `index` | `nominal` | Nominell återhämtning (kr) eller relativt OMX (så marknadsuppgång inte räknas som återhämtning) |
| `--years` | heltal | `8` | Hur många år bakåt |
| `--universe` | `large-cap` \| `demo` \| eget namn | `large-cap` | Vilken aktielista som analyseras |
| `--list` | filväg | – | Egen lista: en `SYMBOL Namn` per rad (`#` = kommentar) |
| `--minYield` | procent | `0` | Filtrera bort aktier med lägre direktavkastning (senaste 12 mån) |
| `--minEvents` | heltal | `1` | Kräv minst så många historiska x-dagar för att en aktie ska rankas |
| `--symbol` | Yahoo-symbol | – | Analysera en enda aktie |
| `--delay` | ms | `300` | Paus mellan hämtningar (artighet mot Yahoo) |
| `--refresh` | – | av | Ignorera rådata-cachen, hämta om allt |
| `--maxAge` | timmar | `0` | Hoppa över nätverket helt för aktier vars cache är färskare än så — gör avbrutna körningar återupptagbara (`--maxAge 12`) |
| `--json` | valfri filväg | – | Skriv resultatet som JSON (default `data/analysis.json`) |

### Välja vilka aktier som analyseras (universum)

Ordning: `--symbol` > `--list <fil>` > `data/universe.json[namn]` > inbyggd lista.

- **`data/universe.json`** (används i första hand) levereras med `large-cap`:
  hela Nasdaq Stockholm Large Cap (~100 bolag, en aktieklass per bolag, seed
  från segmentindelningen början av 2026). Nyintroduktioner utan
  utdelningshistorik är utelämnade.
- **Lägg till en egen lista** genom att lägga till en ny nyckel i samma fil:
  ```json
  "mid-cap": [
    { "symbol": "BUFAB.ST", "name": "Bufab" }
  ]
  ```
  och kör `node src/cli.js --universe mid-cap`. Vilket namn som helst funkar.
- **Eller en textfil**, en ticker per rad — `node src/cli.js --list mina.txt`:
  ```
  INVE-B.ST  Investor B
  VOLV-B.ST  Volvo B
  # rader som börjar med # hoppas över
  ```
- **Verifiera tickers** efter ändringar (kräver nät):
  `npm run validate` (eller `--universe <namn>` / `--list <fil>`). Kollar att
  varje symbol finns på Yahoo och listar de som ska fixas eller tas bort.

Segmentindelningen revideras halvårsvis av Nasdaq — uppdatera listan från den
officiella källan vid behov och kör validatorn igen. Inbyggt i koden finns även
`demo` (8 aktier) för snabba körningar.

### Rådata-cache och JSON-utdata

Rådata (kurser + utdelningar) cachas per aktie i `data/history/<SYMBOL>.json`.
Första körningen hämtar full historik; senare körningar hämtar bara svansen
(med ~10 dagars överlapp för korrigerade slutkurser) och mergar. Det gör
dagliga uppdateringar billiga, och att laborera med flaggor (`--window`,
`--basis`, `--dropAt`) kostar inget nätverk alls när cachen finns.

- Stämmer inte överlappet med cachen (t.ex. efter en split – Yahoo-priserna är
  ojusterade) slängs den aktiens cache och hela historiken hämtas om automatiskt.
- `--refresh` tvingar full omhämtning för alla.
- `--years` längre än cachens täckning ger också automatisk full omhämtning.

`--json [fil]` skriver dessutom resultatet som JSON (default
`data/analysis.json`) med konfiguration, ranking och bortfiltrerat — det är
filen appen/prototypen ska läsa, och det ett schemalagt jobb ska producera.

### Minsta utdelning

`--minYield` beräknar direktavkastning som summan av utdelningar de senaste 12
månaderna delat på senaste kursen, och hoppar över allt under gränsen **innan**
gap-analysen körs — så lågutdelare gallras bort direkt. `--minEvents` säkrar att
en aktie har tillräckligt många x-dagar för att statistiken ska betyda något.

Exempel på utdata:

```
Aktie               Fyllt%  Median  Föll≥utd%  Snitt×  Sen.3år%   n
───────────────────────────────────────────────────────────────────
Atlas Copco A          88%      6d       75%    1.05       100%   8
Investor B             83%      7d       67%    1.08        80%   6
...
```

## Så räknas det

För varje historisk x-dag med utdelning **D**:

- `P_före` = stängning dagen före x-dagen (sista dagen *med* rätt till utdelning).
- **Fall** = `P_före − kurs på x-dagen` (öppning eller stängning enligt `--dropAt`).
  Flaggas om `Fall ≥ D`.
- **Återhämtning** = första handelsdagen (räknat från x-dagen) där stängningen är
  tillbaka på `P_före`. Med `--basis index` höjs tröskeln med OMX-utvecklingen,
  så att aktien måste slå *marknaden* – inte bara stiga med den.
- Scanningen kapas vid fönstret och korsar aldrig in i nästa utdelningscykel.

Per aktie aggregeras: fyllnadsfrekvens, median- och längsta återhämtning, andel
som föll ≥ utdelningen, snitt fall ÷ utdelning, och frekvens de senaste 3 åren.

**Ärlighet:** frekvens ≠ garanti. Underlaget per aktie är litet (1–2 x-dagar/år),
och en nominell "snabb återhämtning" i en tjurmarknad kan mest vara allmän
uppgång – därför `--basis index`. Kolla alltid `n` (antal x-dagar).

## Datakälla

Standard är **Yahoo Finance** (`query1.finance.yahoo.com`) – gratis och oofficiellt,
med bra svensk täckning (`INVE-B.ST`, `VOLV-B.ST` …), ojusterat råpris och
x-dagar/utdelningar i samma anrop. Nackdel: oofficiellt, kan ändras/strypas och
går inte att anropa direkt från en webbläsare (CORS) – därför server-sidan.

**429-blockering:** Yahoo fingeravtrycksblockerar skript-klienter (curl, Node
fetch) från vissa nätverk men släpper igenom riktiga webbläsare. Klienten
provar därför direkt-fetch först och växlar automatiskt till **headless Chrome**
som hämtare vid 429 (≈1–2 s per anrop i stället för ~100 ms – märks på stora
universum). Chrome/Chromium hittas automatiskt; peka ut en annan binär med
miljövariabeln `CHROME=<sökväg>`.

Byt datakälla genom att skriva en ny klient med samma form som `yahoo.js`
(`{ bars, dividends }`). Alternativ vid behov av robusthet: EOD Historical Data
eller Börsdata (båda betalda, bättre nordisk kvalitet).

## Att visa i mobilen

`cli.js` skriver bara en tabell. För en app i telefonen är nästa steg att lägga
motorn bakom ett litet HTTP-API och koppla på prototypens analysvy som frontend,
och deploya till en host. API-nyckel/datakälla ligger då säkert på servern, aldrig
i klienten.

## Struktur

```
src/gapfill.js    ren analysmotor (ingen I/O) – hjärtat, fullt testat
src/metrics.js    direktavkastning för att förfiltrera universum
src/yahoo.js      Yahoo-klient + parser (Chrome-fallback vid 429; parseChart testbar utan nät)
src/history.js    rådata-cache per aktie + inkrementell merge (mergeSeries testad utan nät)
src/stocks.js     inbyggda listor (demo, fallback-large-cap) + OMX-index
src/universe.js   löser universum: --symbol > --list > universe.json > inbyggt
src/validate.js   kollar att alla tickers i ett universum finns på Yahoo
src/cli.js        hämtar (cachat) + filtrerar + analyserar + skriver tabell/JSON
data/universe.json  aktielistor per namn – large-cap (hela) medföljer, egna läggs till här
data/history/     rådata-cache, en fil per aktie (skapas vid första körningen)
data/analysis.json  senaste analysresultatet som JSON (skapas av --json)
test/             enhetstester (node --test) – 19 st
```
