// Resolve which stocks to analyse.
// Order: --symbol > --list <file> > data/universe.json[name] > built-in name.
// Shared by cli.js (analysis) and validate.js (ticker check).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { builtinUniverse } from "./stocks.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Read a plain-text ticker list: one per line, "SYMBOL Optional Name",
// blank lines and lines starting with # ignored.
export function readListFile(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [symbol, ...rest] = l.split(/\s+/);
      return { symbol, name: rest.join(" ") || symbol };
    });
}

export function resolveUniverse(cfg) {
  if (cfg.symbol) return [{ symbol: cfg.symbol, name: cfg.symbol }];
  if (cfg.list) return readListFile(cfg.list);
  const dataFile = join(ROOT, "data", "universe.json");
  if (existsSync(dataFile)) {
    const data = JSON.parse(readFileSync(dataFile, "utf8"));
    if (Array.isArray(data[cfg.universe]) && data[cfg.universe].length) return data[cfg.universe];
  }
  const built = builtinUniverse(cfg.universe);
  if (!built) throw new Error(`Okänt universum: "${cfg.universe}" (lägg till i data/universe.json eller använd --list)`);
  return built;
}
