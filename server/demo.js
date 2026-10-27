// Demo mode: replays a pre-written roast through the same event stream the live
// mode uses, so the whole UI can be tried with zero API spend.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PERSONAS } from "./personas.js";
import { parseRound1, parseRound2 } from "./parse.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEMO = JSON.parse(readFileSync(path.join(here, "..", "data", "demo-roast.json"), "utf8"));

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    });
  });

async function typeOut(send, persona, round, text, signal, speed) {
  const words = text.split(/(\s+)/);
  for (let i = 0; i < words.length; i += 3) {
    send({ type: "delta", persona, round, text: words.slice(i, i + 3).join("") });
    await sleep(speed, signal);
  }
}

export async function runDemo({ send, signal, speed = 28 }) {
  send({ type: "phase", phase: "round1", label: "Round 1: the roast" });
  await Promise.all(
    PERSONAS.map(async (p, i) => {
      await sleep(250 + i * 350, signal);
      send({ type: "speaking", persona: p.id, round: 1 });
      const text = DEMO.round1[p.id];
      await typeOut(send, p.id, 1, text, signal, speed + i * 4);
      send({ type: "persona_done", persona: p.id, round: 1, result: { text, ...parseRound1(text) } });
    })
  );

  send({ type: "phase", phase: "round2", label: "Round 2: cross-fire" });
  const tally = { endorse: 0, amend: 0, object: 0 };
  await Promise.all(
    PERSONAS.map(async (p, i) => {
      await sleep(200 + i * 300, signal);
      send({ type: "speaking", persona: p.id, round: 2 });
      const text = DEMO.round2[p.id];
      await typeOut(send, p.id, 2, text, signal, speed);
      const parsed = parseRound2(text);
      if (parsed.stance) tally[parsed.stance.toLowerCase()]++;
      send({ type: "persona_done", persona: p.id, round: 2, result: { text, ...parsed } });
    })
  );

  send({ type: "phase", phase: "verdict", label: "The Chair's verdict" });
  send({ type: "speaking", persona: "chair", round: 3 });
  await sleep(1800, signal);
  const scores = Object.fromEntries(PERSONAS.map((p) => [p.id, parseRound1(DEMO.round1[p.id]).score]));
  send({ type: "verdict", verdict: { ...DEMO.verdict, tally, scores } });
  send({ type: "usage", model: "demo (no API call)", inputTokens: 0, outputTokens: 0, estCostUsd: 0 });
}
