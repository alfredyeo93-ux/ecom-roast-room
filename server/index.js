import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolveApiKey } from "./apiKey.js";
import { normaliseInput, computeMetrics, buildBrief, fetchStoreSnippet } from "./brief.js";
import { runRoast, MODEL } from "./roast.js";
import { runDemo } from "./demo.js";
import { publicPersonas } from "./personas.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const PORT = Number(process.env.PORT || 5178);

const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(root, "public")));
// three.js is served straight from node_modules, so there is no build step.
app.use("/vendor/three", express.static(path.join(root, "node_modules", "three")));
// The browser reuses the server's tolerant parser to render replies while they stream.
app.get("/lib/parse.js", (_req, res) => res.type("text/javascript").sendFile(path.join(here, "parse.js")));

app.get("/api/health", (_req, res) => {
  const { key, source } = resolveApiKey();
  res.json({ ok: true, model: MODEL, hasKey: Boolean(key), keySource: source, personas: publicPersonas() });
});

app.post("/api/roast", async (req, res) => {
  const demo = req.query.demo === "1" || req.body?.demo === true;
  const input = normaliseInput(req.body);
  const metrics = computeMetrics(input);

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  // Every event is also kept for a local transcript in runs/ (gitignored), so a
  // roast can be reviewed or debugged after the fact. Streaming deltas are
  // dropped from the file; the per-advisor final text is kept instead.
  const log = [];
  const send = (evt) => {
    if (evt.type !== "delta") log.push({ t: Date.now(), ...evt });
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(evt)}\n\n`);
  };

  const ac = new AbortController();
  res.on("close", () => ac.abort());

  try {
    send({ type: "metrics", metrics });
    if (demo) {
      await runDemo({ send, signal: ac.signal });
    } else {
      // A key typed into the browser arrives in this header. It is used for this
      // request only: never logged, never written to runs/, never kept in memory.
      const headerKey = req.get("x-anthropic-key");
      const userKey = typeof headerKey === "string" ? headerKey.trim() : "";
      const key = userKey || resolveApiKey().key;
      if (userKey && !/^sk-ant-[\w-]{20,300}$/.test(userKey)) {
        send({ type: "error", message: "That doesn't look like a Claude API key. It should start with sk-ant-." });
      } else if (!key) {
        send({
          type: "error",
          message: "No API key. Paste your Claude API key into the form, set ANTHROPIC_API_KEY on the server, or tick Demo mode.",
        });
      } else {
        const snippet = req.body?.fetchSite === false || !input.storeUrl ? "" : await fetchStoreSnippet(input.storeUrl);
        send({ type: "site", fetched: Boolean(snippet) });
        await runRoast({ apiKey: key, brief: buildBrief(input, metrics, snippet), send, signal: ac.signal });
      }
    }
  } catch (err) {
    if (!ac.signal.aborted) send({ type: "error", message: err?.message || String(err) });
  } finally {
    send({ type: "done" });
    res.end();
    saveRun({ demo, input, events: log });
  }
});

function saveRun(run) {
  try {
    const dir = path.join(root, "runs");
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(dir, `${stamp}${run.demo ? "-demo" : ""}.json`);
    writeFileSync(file, JSON.stringify(run, null, 2));
    console.log(`Saved run transcript: runs/${path.basename(file)}`);
  } catch (err) {
    console.warn(`Couldn't save run transcript: ${err.message}`);
  }
}

app.listen(PORT, () => {
  const { key, source } = resolveApiKey();
  console.log(`E-com Roast Room on http://localhost:${PORT}`);
  console.log(`Model: ${MODEL} | API key: ${key ? `found (${source})` : "not found, demo mode only"}`);
});
