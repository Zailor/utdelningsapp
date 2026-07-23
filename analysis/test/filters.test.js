import { test } from "node:test";
import assert from "node:assert/strict";
import { trailingDividendYield } from "../src/metrics.js";
import { builtinUniverse } from "../src/stocks.js";

const bars = [
  { date: "2023-05-10", close: 90 },
  { date: "2024-05-10", close: 100 }, // latest close
];

test("trailing yield = last 12 months of dividends / latest close", () => {
  const divs = [
    { exDate: "2020-01-02", amount: 4 }, // too old, excluded
    { exDate: "2024-05-03", amount: 5 }, // within 12 months
  ];
  const y = trailingDividendYield(bars, divs);
  assert.equal(y.ttm, 5);
  assert.equal(y.price, 100);
  assert.equal(y.yield, 5);
});

test("multiple dividends within the window are summed", () => {
  const divs = [
    { exDate: "2023-11-15", amount: 2 },
    { exDate: "2024-05-03", amount: 3 },
  ];
  assert.equal(trailingDividendYield(bars, divs).yield, 5); // (2+3)/100
});

test("no recent dividend → zero yield (would be filtered out)", () => {
  const divs = [{ exDate: "2019-05-03", amount: 8 }];
  assert.equal(trailingDividendYield(bars, divs).yield, 0);
});

test("empty bars are handled", () => {
  const y = trailingDividendYield([], [{ exDate: "2024-05-03", amount: 5 }]);
  assert.equal(y.yield, 0);
  assert.equal(y.price, null);
});

test("built-in universes resolve; unknown returns null", () => {
  assert.ok(builtinUniverse("large-cap").length > 20);
  assert.ok(builtinUniverse("demo").length > 0);
  assert.equal(builtinUniverse("nope"), null);
  // every entry has a symbol + name
  for (const s of builtinUniverse("large-cap")) {
    assert.ok(s.symbol && s.symbol.endsWith(".ST"));
    assert.ok(s.name);
  }
});
