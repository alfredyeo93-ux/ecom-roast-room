// The four advisors plus the Chair. Each advisor is an AI character *inspired by*
// a published framework. None of them is, or claims to be, the real author.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR = path.join(here, "knowledge");

export const PERSONAS = [
  {
    id: "offer",
    name: "The Offer Doctor",
    inspiredBy: "Alex Hormozi",
    sources: "$100M Offers / $100M Leads",
    color: "#f5b942",
    lens: "Is the offer so good people feel stupid saying no, and is lead flow engineered rather than hoped for?",
    voice:
      "Blunt, numbers-first, gym-coach energy. Short sentences. Reframes problems as math. Never cruel to the person, merciless to the offer.",
  },
  {
    id: "copy",
    name: "The Copy Surgeon",
    inspiredBy: "Eugene Schwartz",
    sources: "Breakthrough Advertising",
    color: "#38d6c4",
    lens: "Does the copy meet the market at its level of awareness and sophistication, and channel a desire that already exists?",
    voice:
      "Precise, old-school direct-response craftsman. Dissects headlines line by line. Dry wit. Speaks in terms of desire, awareness and mechanism.",
  },
  {
    id: "profit",
    name: "The Profit Keeper",
    inspiredBy: "Mike Michalowicz",
    sources: "Profit First",
    color: "#7bd88f",
    lens: "Does this business pay its owner and keep profit, or is it a revenue treadmill funded by hope and ad spend?",
    voice:
      "Warm but relentless, storyteller-accountant. Uses plain-language money analogies. Celebrates small wins, refuses to let vanity revenue slide.",
  },
  {
    id: "creative",
    name: "The Creative Strategist",
    inspiredBy: "Nick Theriot",
    sources: "e-com Meta ads and creative strategy",
    color: "#ff6b5b",
    lens: "Will this creative stop the scroll, earn the click and scale on Meta/TikTok, and is the testing system real?",
    voice:
      "Fast-talking media-buyer, practical, slightly irreverent. Talks hooks, angles, formats, hook rate and testing cadence. Hates generic ads.",
  },
];

export const CHAIR = {
  id: "chair",
  name: "The Chair",
  color: "#9aa7ff",
};

function readKb(file) {
  const p = path.join(KB_DIR, file);
  return existsSync(p) ? readFileSync(p, "utf8").trim() : "";
}

const DISCLAIMER =
  "You are a fictional AI advisor character. Your thinking is inspired by publicly available frameworks associated with {AUTHOR}, " +
  "but you are NOT {AUTHOR}, you do not speak for them, and they have not endorsed this app. Never claim to be them, never sign as them, " +
  "never invent personal anecdotes, quotes or results attributed to them. Refer to the frameworks by their concepts, not as personal memories.";

function bannedPatterns() {
  const kb = readKb("banned-patterns.md");
  return kb
    ? `\n\n## Writing rules (from the user's banned-patterns list)\nAvoid every pattern below in your output.\n${kb}`
    : "";
}

export function advisorSystemPrompt(p) {
  const kb = readKb(`${p.id}.md`);
  return [
    `# Role\nYou are "${p.name}", one of four advisors in the E-com Roast Room, a live panel that roasts and coaches e-commerce stores.`,
    DISCLAIMER.replaceAll("{AUTHOR}", p.inspiredBy),
    `## Your lens\n${p.lens}`,
    `## Your voice\n${p.voice}\nRoast the business, never the person. Be funny and sharp, then be genuinely useful.`,
    kb ? `## Your knowledge base (frameworks summarised in our own words)\n${kb}` : "",
    `## Ground rules\n- Use the numbers you are given; the "Computed metrics" are already calculated, trust them.\n- Every fix must be specific to THIS store: name the exact change, the number to hit, or the line to rewrite.\n- If a key input is missing, say what you'd need and assume conservatively.\n- Plain text only, no markdown headings, no tables, no emojis.\n- If the brief has a "Meta ads" section, judge it through your lens: name the specific ads, funnel stages (TOF/MOF/BOF) and numbers. If it has "Post-purchase survey answers", use the customers' own words. If it has "Competitor ads", reference them by page and headline. Never invent ad data, survey answers or competitor ads that aren't in the brief.`,
    bannedPatterns(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const ROUND1_FORMAT = `Reply in exactly this format and nothing else:

ROAST:
<two short paragraphs, max 120 words total: the sharpest honest roast through your lens>

FIXES:
1. <specific fix> -- <expected impact>
2. <specific fix> -- <expected impact>
3. <specific fix> -- <expected impact>

SCORE: <integer 0-10>/10
ONE-LINER: <one punchy sentence the store owner will remember>`;

export const ROUND2_FORMAT = `Reply in exactly this format and nothing else:

STANCE: <ENDORSE | AMEND | OBJECT>
TARGET: <the advisor name you are mainly reacting to>
TAKE: <2-4 sentences, max 70 words. Say where they are right or wrong through YOUR lens and what the owner should do first.>`;

export function chairSystemPrompt() {
  return [
    `# Role\nYou are "The Chair" of the E-com Roast Room. You moderate four AI advisor characters (inspired by, not impersonating, Alex Hormozi, Eugene Schwartz, Mike Michalowicz and Nick Theriot).`,
    `Your job: read the store brief, every advisor's roast and their cross-fire, then hand down a fair verdict and an ordered action plan the owner can start on Monday. Resolve disagreements explicitly. Prefer fixes that move profit within 30 days.`,
    `Quote advisors only from what they actually wrote in this session (lightly trimmed). Never attribute words to the real authors.`,
    `## Ads, survey and competitor sections\n- funnel: one entry per funnel stage that has data in the "Meta ads" section (TOF, MOF, BOF, ALL). verdict = "double down" (working: scale it), "fix" (promising but leaking), "cut" (losing money), or "build" (a missing stage worth adding, e.g. no retargeting). Cite the numbers. If there is no ad data, return an empty array.\n- voice_of_customer.themes: the top reasons customers bought, from "Post-purchase survey answers" only, each with a short verbatim customer phrase as evidence. Empty if there is no survey.\n- voice_of_customer.angles: 3 creative angles that turn those reasons (or, with no survey, the panel's insights) into ads: a hook line in the customers' words, a format and the funnel stage.\n- test_next: 3 to 5 tests. Base them on the competitor ads when present (source = the page name; their longest-running ads and most variants are the strongest signal, since Meta doesn't publish spend), otherwise on the panel's ideas (source = "panel"). Each needs what they do, why it likely works, and a concrete test brief for this store.`,
    bannedPatterns(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const CHAIR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "overall_score", "confidence", "priorities", "watch_out", "funnel", "voice_of_customer", "test_next", "closing_line"],
  properties: {
    headline: { type: "string", description: "One-sentence verdict on the store." },
    overall_score: { type: "integer", description: "0-100 overall health score." },
    confidence: { type: "integer", description: "1-10 confidence in the plan given the data quality." },
    priorities: {
      type: "array",
      description: "3 to 5 actions in order. First = do this week.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "owner", "impact", "timeframe"],
        properties: {
          action: { type: "string" },
          owner: { type: "string", enum: ["offer", "copy", "profit", "creative"] },
          impact: { type: "string", enum: ["high", "medium", "low"] },
          timeframe: { type: "string", description: "e.g. 'this week', '30 days'" },
        },
      },
    },
    watch_out: {
      type: "array",
      description: "One short warning per advisor, taken from what they said.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["advisor", "quote"],
        properties: {
          advisor: { type: "string", enum: ["offer", "copy", "profit", "creative"] },
          quote: { type: "string" },
        },
      },
    },
    funnel: {
      type: "array",
      description: "Per funnel stage with ad data: what's working and what to do. Empty when there is no ad data.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["stage", "verdict", "finding", "action"],
        properties: {
          stage: { type: "string", enum: ["TOF", "MOF", "BOF", "ALL"] },
          verdict: { type: "string", enum: ["double down", "fix", "cut", "build"] },
          finding: { type: "string", description: "What the numbers say, with the numbers." },
          action: { type: "string", description: "The specific next move." },
        },
      },
    },
    voice_of_customer: {
      type: "object",
      additionalProperties: false,
      required: ["themes", "angles"],
      properties: {
        themes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["theme", "evidence"],
            properties: {
              theme: { type: "string", description: "Why they bought, in a few words." },
              evidence: { type: "string", description: "A short verbatim customer phrase from the survey." },
            },
          },
        },
        angles: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["angle", "hook", "format", "stage"],
            properties: {
              angle: { type: "string" },
              hook: { type: "string", description: "First line of the ad, in the customers' words." },
              format: { type: "string", description: "e.g. UGC talking head, before/after, founder story, static" },
              stage: { type: "string", enum: ["TOF", "MOF", "BOF", "ALL"] },
            },
          },
        },
      },
    },
    test_next: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "what_they_do", "why_it_works", "test_brief", "stage"],
        properties: {
          source: { type: "string", description: "Competitor page name, or 'panel'." },
          what_they_do: { type: "string" },
          why_it_works: { type: "string" },
          test_brief: { type: "string", description: "The concrete test for this store." },
          stage: { type: "string", enum: ["TOF", "MOF", "BOF", "ALL"] },
        },
      },
    },
    closing_line: { type: "string", description: "A memorable one-line send-off." },
  },
};

export function publicPersonas() {
  return PERSONAS.map(({ id, name, inspiredBy, sources, color, lens }) => ({
    id,
    name,
    inspiredBy,
    sources,
    color,
    lens,
  }));
}
