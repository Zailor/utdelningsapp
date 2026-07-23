// Stock universes (which tickers to analyse) + the benchmark index.
// ".ST" = Nasdaq Stockholm. Yahoo uses "-B.ST" etc. for share classes.
//
// The built-in lists are curated starting points. For the *full* official
// segmentation (all of Stockholm, complete Large/Mid/Small Cap) drop your own
// list in via `--list <file>` or a `data/universe.json` — see README. That way
// the authoritative list stays a data drop-in, not hardcoded here.

export const INDEX = { symbol: "^OMX", name: "OMX Stockholm 30" };

// A small hand-picked set — handy for quick runs.
const DEMO = [
  { symbol: "INVE-B.ST", name: "Investor B" },
  { symbol: "VOLV-B.ST", name: "Volvo B" },
  { symbol: "ATCO-A.ST", name: "Atlas Copco A" },
  { symbol: "SHB-A.ST", name: "Handelsbanken A" },
  { symbol: "AXFO.ST", name: "Axfood" },
  { symbol: "HM-B.ST", name: "H&M B" },
  { symbol: "TELIA.ST", name: "Telia" },
  { symbol: "CAST.ST", name: "Castellum" },
];

// Curated Stockholm Large Cap names (major, stable tickers). Not exhaustive —
// refresh from the official list for complete coverage.
const LARGE_CAP = [
  { symbol: "ABB.ST", name: "ABB" },
  { symbol: "ALFA.ST", name: "Alfa Laval" },
  { symbol: "ASSA-B.ST", name: "Assa Abloy B" },
  { symbol: "ATCO-A.ST", name: "Atlas Copco A" },
  { symbol: "ATCO-B.ST", name: "Atlas Copco B" },
  { symbol: "AZN.ST", name: "AstraZeneca" },
  { symbol: "AXFO.ST", name: "Axfood" },
  { symbol: "BALD-B.ST", name: "Balder B" },
  { symbol: "BOL.ST", name: "Boliden" },
  { symbol: "CAST.ST", name: "Castellum" },
  { symbol: "ELUX-B.ST", name: "Electrolux B" },
  { symbol: "EPI-A.ST", name: "Epiroc A" },
  { symbol: "ERIC-B.ST", name: "Ericsson B" },
  { symbol: "ESSITY-B.ST", name: "Essity B" },
  { symbol: "EVO.ST", name: "Evolution" },
  { symbol: "GETI-B.ST", name: "Getinge B" },
  { symbol: "HM-B.ST", name: "H&M B" },
  { symbol: "HEXA-B.ST", name: "Hexagon B" },
  { symbol: "HOLM-B.ST", name: "Holmen B" },
  { symbol: "HUSQ-B.ST", name: "Husqvarna B" },
  { symbol: "INDU-C.ST", name: "Industrivärden C" },
  { symbol: "INVE-B.ST", name: "Investor B" },
  { symbol: "KINV-B.ST", name: "Kinnevik B" },
  { symbol: "LATO-B.ST", name: "Latour B" },
  { symbol: "NDA-SE.ST", name: "Nordea" },
  { symbol: "NIBE-B.ST", name: "NIBE B" },
  { symbol: "SAAB-B.ST", name: "Saab B" },
  { symbol: "SAND.ST", name: "Sandvik" },
  { symbol: "SCA-B.ST", name: "SCA B" },
  { symbol: "SEB-A.ST", name: "SEB A" },
  { symbol: "SECU-B.ST", name: "Securitas B" },
  { symbol: "SHB-A.ST", name: "Handelsbanken A" },
  { symbol: "SKA-B.ST", name: "Skanska B" },
  { symbol: "SKF-B.ST", name: "SKF B" },
  { symbol: "SSAB-A.ST", name: "SSAB A" },
  { symbol: "SWED-A.ST", name: "Swedbank A" },
  { symbol: "TEL2-B.ST", name: "Tele2 B" },
  { symbol: "TELIA.ST", name: "Telia" },
  { symbol: "TREL-B.ST", name: "Trelleborg B" },
  { symbol: "VOLV-B.ST", name: "Volvo B" },
];

export const UNIVERSES = {
  demo: DEMO,
  "large-cap": LARGE_CAP,
};

/** Built-in universe by name, or null. */
export function builtinUniverse(name) {
  return UNIVERSES[name] || null;
}

// Back-compat: default export list used by earlier code.
export const STOCKS = DEMO;
