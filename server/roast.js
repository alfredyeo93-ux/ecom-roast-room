// Orchestrates one roast session:
//   Round 1  - each advisor roasts the store in parallel (streamed)
//   Round 2  - cross-fire: each advisor reacts to the others (streamed)
//   Verdict  - the Chair merges everything into a scored action plan (JSON)
// The staged council idea (independent opinions -> peer review -> chair) is
// inspired by karpathy/llm-council; this implementation is original.
import Anthropic from "@anthropic-ai/sdk";
import {
  PERSONAS,
  advisorSystemPrompt,
  chairSystemPrompt,
  CHAIR_SCHEMA,
  ROUND1_FORMAT,
  ROUND2_FORMAT,
} from "./personas.js";
import { parseRound1, parseRound2 } from "./parse.js";

export const MODEL = process.env.ROAST_MODEL || "claude-opus-5-5";
const FALLBACKS_ON = (process.env.ROAST_FALLBACKS || "on") !== "off";

// $ per million tokens, used only for the on-screen cost estimate.
const PRICING = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-1": [10, 50],
};

function requestParams({ system, user, effort, maxTokens, format }) {
  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort, ...(format ? { format } : {}) },
  };
  // Server-side refusal fallback (Claude API only). Disable with ROAST_FALLBACKS=off.
  if (FALLBACKS_ON && !MODEL.startsWith("claude-haiku")) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  return params;
}

async function streamText(client, params, signal, onDelta) {
  const stream = client.beta.messages.stream(params, { signal });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      onDelta(event.delta.text);
    }
  }
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") {
    const err = new Error("The model declined this request.");
    err.code = "refusal";
    throw err;
  }
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return { text, usage: msg.usage, stopReason: msg.stop_reason };
}

function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "Claude rejected the API key (401). Check the key you entered, or ANTHROPIC_API_KEY on the server.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key can't use that model (403).";
  if (err instanceof Anthropic.NotFoundError) return `Model not found: ${MODEL}. Set ROAST_MODEL to a valid model id.`;
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Claude API (429). Wait a moment and retry.";
  if (err instanceof Anthropic.BadRequestError) return `Claude API rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the Claude API (network).";
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status ?? ""}: ${err.message}`;
  return err?.message || String(err);
}

// Pinned on purpose: tools such as Claude Code export ANTHROPIC_BASE_URL for their
// own traffic, and the SDK would otherwise pick it up from the inherited env.
export const BASE_URL = process.env.ROAST_BASE_URL || "https://api.anthropic.com";

export async function runRoast({ apiKey, brief, send, signal }) {
  const client = new Anthropic({ apiKey, baseURL: BASE_URL });
  const usage = { input: 0, output: 0 };
  const addUsage = (u) => {
    if (!u) return;
    usage.input += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    usage.output += u.output_tokens || 0;
  };

  // ---------- Round 1: the roast ----------
  send({ type: "phase", phase: "round1", label: "Round 1: the roast" });
  const round1 = {};
  await Promise.all(
    PERSONAS.map(async (p) => {
      send({ type: "speaking", persona: p.id, round: 1 });
      try {
        const { text, usage: u } = await streamText(
          client,
          requestParams({
            system: advisorSystemPrompt(p),
            user: `${brief}\n\n---\nRoast this store through your lens.\n\n${ROUND1_FORMAT}`,
            effort: process.env.ROAST_EFFORT_R1 || "medium",
            maxTokens: 12000,
          }),
          signal,
          (delta) => send({ type: "delta", persona: p.id, round: 1, text: delta })
        );
        addUsage(u);
        round1[p.id] = { text, ...parseRound1(text) };
        send({ type: "persona_done", persona: p.id, round: 1, result: round1[p.id] });
      } catch (err) {
        if (signal?.aborted) throw err;
        round1[p.id] = { error: friendlyError(err) };
        send({ type: "persona_error", persona: p.id, round: 1, message: friendlyError(err) });
      }
    })
  );

  const ok = PERSONAS.filter((p) => round1[p.id] && !round1[p.id].error);
  if (ok.length === 0) {
    send({ type: "error", message: Object.values(round1)[0]?.error || "All advisors failed." });
    return;
  }

  const transcript1 = ok.map((p) => `## ${p.name} (${p.id})\n${round1[p.id].text}`).join("\n\n");

  // ---------- Round 2: cross-fire ----------
  send({ type: "phase", phase: "round2", label: "Round 2: cross-fire" });
  const round2 = {};
  await Promise.all(
    ok.map(async (p) => {
      send({ type: "speaking", persona: p.id, round: 2 });
      try {
        const others = ok.filter((o) => o.id !== p.id);
        const { text, usage: u } = await streamText(
          client,
          requestParams({
            system: advisorSystemPrompt(p),
            user:
              `${brief}\n\n---\nYour own roast:\n${round1[p.id].text}\n\n---\nWhat the other advisors said:\n` +
              others.map((o) => `## ${o.name}\n${round1[o.id].text}`).join("\n\n") +
              `\n\n---\nCross-fire: pick the one point from another advisor you most agree or disagree with. ` +
              `ENDORSE = their plan is right as is, AMEND = right direction but change it, OBJECT = it would hurt the store.\n\n${ROUND2_FORMAT}`,
            effort: process.env.ROAST_EFFORT_R2 || "low",
            maxTokens: 6000,
          }),
          signal,
          (delta) => send({ type: "delta", persona: p.id, round: 2, text: delta })
        );
        addUsage(u);
        round2[p.id] = { text, ...parseRound2(text) };
        send({ type: "persona_done", persona: p.id, round: 2, result: round2[p.id] });
      } catch (err) {
        if (signal?.aborted) throw err;
        round2[p.id] = { error: friendlyError(err) };
        send({ type: "persona_error", persona: p.id, round: 2, message: friendlyError(err) });
      }
    })
  );

  const tally = { endorse: 0, amend: 0, object: 0 };
  for (const r of Object.values(round2)) {
    if (r.stance) tally[r.stance.toLowerCase()]++;
  }

  // ---------- Verdict ----------
  send({ type: "phase", phase: "verdict", label: "The Chair's verdict" });
  send({ type: "speaking", persona: "chair", round: 3 });
  const transcript2 = ok
    .filter((p) => round2[p.id] && !round2[p.id].error)
    .map((p) => `## ${p.name} (${p.id})\n${round2[p.id].text}`)
    .join("\n\n");
  try {
    const { text, usage: u } = await streamText(
      client,
      requestParams({
        system: chairSystemPrompt(),
        user: `${brief}\n\n---\n# Round 1 roasts\n${transcript1}\n\n# Round 2 cross-fire\n${transcript2}\n\nStance tally: ${JSON.stringify(tally)}\n\nHand down the verdict as JSON.`,
        effort: process.env.ROAST_EFFORT_CHAIR || "medium",
        maxTokens: 12000,
        format: { type: "json_schema", schema: CHAIR_SCHEMA },
      }),
      signal,
      () => {}
    );
    addUsage(u);
    const verdict = JSON.parse(text);
    const scores = Object.fromEntries(ok.map((p) => [p.id, round1[p.id].score]));
    send({ type: "verdict", verdict: { ...verdict, tally, scores } });
  } catch (err) {
    if (signal?.aborted) throw err;
    send({ type: "persona_error", persona: "chair", round: 3, message: friendlyError(err) });
  }

  const [inP, outP] = PRICING[MODEL] || [null, null];
  send({
    type: "usage",
    model: MODEL,
    inputTokens: usage.input,
    outputTokens: usage.output,
    estCostUsd: inP == null ? null : Math.round(((usage.input * inP + usage.output * outP) / 1e6) * 1000) / 1000,
  });
}
