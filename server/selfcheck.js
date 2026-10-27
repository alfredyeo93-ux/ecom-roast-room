// Offline sanity check (no API calls): parsers, metrics and prompt assembly.
// Run with `npm run check`.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { parseRound1, parseRound2 } from "./parse.js";
import { normaliseInput, computeMetrics, buildBrief } from "./brief.js";
import { PERSONAS, advisorSystemPrompt, chairSystemPrompt } from "./personas.js";

const demo = JSON.parse(readFileSync(new URL("../data/demo-roast.json", import.meta.url), "utf8"));
const sample = JSON.parse(readFileSync(new URL("../public/sample-store.json", import.meta.url), "utf8"));

for (const p of PERSONAS) {
  const r1 = parseRound1(demo.round1[p.id]);
  assert.ok(r1.roast.length > 40, `${p.id}: roast parsed`);
  assert.equal(r1.fixes.length, 3, `${p.id}: 3 fixes`);
  assert.ok(r1.score >= 0 && r1.score <= 10, `${p.id}: score`);
  assert.ok(r1.oneLiner, `${p.id}: one-liner`);
  const r2 = parseRound2(demo.round2[p.id]);
  assert.match(r2.stance, /ENDORSE|AMEND|OBJECT/, `${p.id}: stance`);
  const sys = advisorSystemPrompt(p);
  assert.ok(sys.includes(`NOT ${p.inspiredBy}`), `${p.id}: disclaimer in prompt`);
}
assert.ok(chairSystemPrompt().length > 100);

const input = normaliseInput(sample);
const m = computeMetrics(input);
assert.equal(m.orders, 955);
assert.ok(Math.abs(m.mer - 2.27) < 0.01, "MER");
assert.ok(m.netProfit > 0 && m.netProfit < 200, "net profit near zero for the sample");
const brief = buildBrief(input, m, "");
assert.ok(brief.includes("Break-even ROAS"));

console.log("selfcheck ok");
console.log(`sample: net profit $${Math.round(m.netProfit)}, MER ${m.mer.toFixed(2)}x, break-even ROAS ${m.breakevenRoas.toFixed(2)}x`);
console.log(`advisor prompt size (offer): ~${Math.round(advisorSystemPrompt(PERSONAS[0]).length / 4)} tokens`);
