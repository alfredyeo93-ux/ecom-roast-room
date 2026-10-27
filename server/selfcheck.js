// Offline sanity check (no API calls): parsers, metrics and prompt assembly.
// Run with `npm run check`.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { parseRound1, parseRound2 } from "./parse.js";
import { normaliseInput, computeMetrics, buildBrief } from "./brief.js";
import { PERSONAS, advisorSystemPrompt, chairSystemPrompt, CHAIR_SCHEMA } from "./personas.js";
import { parseCsv, fromAdsManagerCsv, classifyStage, summarizeAds, rankCompetitors, normalizeResearch } from "./ads.js";

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

// ads, survey and competitor research
const csv = [
  "Campaign name,Ad set name,Ad name,Amount spent (USD),Impressions,CTR (link click-through rate),Link clicks,Purchases,Purchases conversion value,ThruPlays",
  '"TOF | Broad, US",Broad 18-34,UGC v1,1000,100000,1.2,1200,40,2400,9000',
  "Retargeting | DPA,ATC 14d,DPA,300,20000,2.5,500,30,1500,",
  "Engagers MOF,VV 50%,Proof carousel,200,15000,1.8,270,6,330,",
].join("\n");
const csvAds = fromAdsManagerCsv(parseCsv(csv));
assert.equal(csvAds.length, 3, "csv rows");
assert.equal(csvAds[0].campaign, "TOF | Broad, US", "quoted comma kept");
assert.deepEqual(csvAds.map((a) => a.stage), ["TOF", "BOF", "MOF"], "funnel staging");
assert.equal(csvAds[1].roas, 5, "roas derived from revenue / spend");
const sum = summarizeAds(csvAds);
assert.equal(sum.totals.spend, 1500);
assert.equal(sum.byStage.BOF.roas, 5);
assert.equal(classifyStage({ campaign: "Brand - CBO - Spring test" }), "TOF");
assert.equal(classifyStage({ campaign: "Advantage+ shopping" }), "ALL");

const comp = rankCompetitors(
  [
    { page_name: "A", ad_creative_link_title: "Old one", ad_delivery_start_time: 1000 },
    { page_name: "B", ad_creative_link_title: "Many", ad_delivery_start_time: 1000 + 86400 * 50 },
    { page_name: "B", ad_creative_link_title: "Many", ad_delivery_start_time: 1000 + 86400 * 55 },
    { page_name: "B", ad_creative_link_title: "Many", ad_delivery_start_time: 1000 + 86400 * 56 },
  ],
  1000 + 86400 * 60
);
assert.equal(comp.ads[0].title, "Old one", "60 days beats 10 days + 2 variants");
assert.equal(comp.ads[1].variants, 3);
assert.equal(comp.ads[1].daysActive, 10, "dated from the oldest variant");

const sampleResearch = normalizeResearch(JSON.parse(readFileSync(new URL("../public/sample-research.json", import.meta.url), "utf8")));
assert.equal(summarizeAds(sampleResearch.ads).totals.spend, 18500, "sample ad spend matches the sample P&L");
assert.ok(sampleResearch.survey.length >= 10 && sampleResearch.competitors.ads.length >= 4);
const rich = buildBrief(input, m, "", sampleResearch);
for (const s of ["# Meta ads", "Post-purchase survey answers", "Competitor ads in this niche", "Meta does not publish spend"]) {
  assert.ok(rich.includes(s), `brief has "${s}"`);
}
assert.ok(!buildBrief(input, m, "", null).includes("# Meta ads"), "no ad section without data");
for (const k of ["funnel", "voice_of_customer", "test_next"]) assert.ok(CHAIR_SCHEMA.required.includes(k) && demo.verdict[k], `${k} in schema and demo`);

console.log("selfcheck ok");
console.log(`sample: net profit $${Math.round(m.netProfit)}, MER ${m.mer.toFixed(2)}x, break-even ROAS ${m.breakevenRoas.toFixed(2)}x`);
console.log(`advisor prompt size (offer): ~${Math.round(advisorSystemPrompt(PERSONAS[0]).length / 4)} tokens`);
