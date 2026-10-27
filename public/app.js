import { createScene } from "/scene.js";
import { parseRound1, parseRound2 } from "/lib/parse.js";

const $ = (s) => document.querySelector(s);
const form = $("#brief");
const goBtn = $("#go");
const demoToggle = $("#demo-toggle");
const statusEl = $("#status");
const statusText = $("#status-text");
const costEl = $("#cost");
const hint = $("#hint");
const advisorsEl = $("#advisors");
const verdictEl = $("#verdict");
const metricsEl = $("#metrics");
const caption = $("#stage-caption");
const toast = $("#toast");

let personas = [];
let scene;
let state;
let hasKey = false;

const KEY_STORE = "roastroom.apiKey";
const keyInput = $("#api-key");
const rememberKey = $("#remember-key");
const store = (kind) => {
  try {
    return window[kind];
  } catch {
    return null;
  }
};
const userKey = () => keyInput.value.trim();

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const byId = (id) => personas.find((p) => p.id === id);

// ---------- boot ----------
const health = await fetch("/api/health").then((r) => r.json());
personas = health.personas;
hasKey = health.hasKey;
costEl.textContent = `model: ${health.model}`;
setupKeyBox();
demoToggle.checked = !hasKey && !userKey();
scene = createScene($("#stage"), personas);
renderCards();

$("#load-sample").addEventListener("click", async () => {
  const sample = await fetch("/sample-store.json").then((r) => r.json());
  fillForm(sample);
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  startRoast();
});

// ---------- bring-your-own API key ----------
// The key lives only in this browser (sessionStorage, or localStorage when
// "Remember" is ticked). It is sent in a header with each live roast and is
// never part of the brief, so it never lands in runs/ transcripts.

function setupKeyBox() {
  const saved = store("localStorage")?.getItem(KEY_STORE);
  keyInput.value = saved || store("sessionStorage")?.getItem(KEY_STORE) || "";
  rememberKey.checked = Boolean(saved);
  $("#keybox").open = !hasKey && !userKey();
  keyInput.addEventListener("input", saveKey);
  rememberKey.addEventListener("change", saveKey);
  $("#clear-key").addEventListener("click", () => {
    keyInput.value = "";
    rememberKey.checked = false;
    saveKey();
  });
  updateKeyHint();
}

function saveKey() {
  const k = userKey();
  try {
    if (k) store("sessionStorage")?.setItem(KEY_STORE, k);
    else store("sessionStorage")?.removeItem(KEY_STORE);
    if (k && rememberKey.checked) store("localStorage")?.setItem(KEY_STORE, k);
    else store("localStorage")?.removeItem(KEY_STORE);
  } catch {
    // storage blocked (private mode): the key still works for this page
  }
  if (k) demoToggle.checked = false;
  updateKeyHint();
}

function updateKeyHint() {
  const k = userKey();
  $("#key-state").textContent = k ? "· set" : hasKey ? "· optional" : "· required for live roasts";
  hint.textContent = k
    ? "Using your API key. Live roasts call Claude and cost about $0.30–0.80 each."
    : hasKey
      ? "Using the server's API key. Live roasts call Claude and cost a little."
      : "Add your Claude API key above for a live roast, or tick Demo mode to try it free.";
}

// ---------- form helpers ----------
function fillForm(data) {
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") continue;
    const val = el.name.startsWith("pnl.") ? data.pnl?.[el.name.slice(4)] : data[el.name];
    el.value = val ?? "";
  }
}

function readForm() {
  const out = { pnl: {} };
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") out[el.name] = el.checked;
    else if (el.name.startsWith("pnl.")) out.pnl[el.name.slice(4)] = el.value;
    else out[el.name] = el.value;
  }
  return out;
}

// ---------- cards ----------
function renderCards() {
  advisorsEl.innerHTML = personas
    .map(
      (p) => `
    <article class="card" id="card-${p.id}" style="--c:${p.color}">
      <div class="card-head">
        <img class="avatar-img" src="/avatars/${p.id}.webp" alt="${esc(p.name)} clay portrait">
        <div class="card-title"><b>${esc(p.name)}</b><small>inspired by ${esc(p.inspiredBy)} · ${esc(p.sources)}</small></div>
        <div class="badge" data-score>–</div>
      </div>
      <p class="lens">${esc(p.lens)}</p>
      <div data-body></div>
    </article>`
    )
    .join("");
}

function cardBody(id) {
  return document.querySelector(`#card-${id} [data-body]`);
}

function renderRound1(id, text, final) {
  const r = parseRound1(text);
  const fixes = r.fixes.length
    ? `<span class="label">FIXES</span><ol>${r.fixes
        .map((f) => `<li>${esc(f.fix)}${f.impact ? `<span class="impact">${esc(f.impact)}</span>` : ""}</li>`)
        .join("")}</ol>`
    : "";
  const roastText = r.roast || (!r.fixes.length ? text.replace(/^ROAST:\s*/i, "") : "");
  cardBody(id).innerHTML =
    `<span class="label">ROAST</span><p class="roast ${final ? "" : "typing"}">${esc(roastText)}</p>` +
    fixes +
    (r.oneLiner ? `<p class="oneliner">“${esc(r.oneLiner)}”</p>` : "") +
    `<div data-xfire></div>`;
  if (r.score != null) {
    document.querySelector(`#card-${id} [data-score]`).textContent = `${r.score}/10`;
  }
  return r;
}

function renderRound2(id, text, final) {
  const r = parseRound2(text);
  const box = document.querySelector(`#card-${id} [data-xfire]`);
  if (!box) return r;
  box.className = "xfire";
  box.innerHTML =
    `<span class="label">CROSS-FIRE</span>` +
    (r.stance ? `<span class="chip ${r.stance}">${r.stance}</span>` : "") +
    (r.target ? `<small>re: ${esc(r.target)}</small>` : "") +
    `<p class="roast ${final ? "" : "typing"}" style="margin-top:4px">${esc(r.take)}</p>`;
  return r;
}

function setSpeaking(id, on) {
  scene.setSpeaking(id, on);
  document.querySelector(`#card-${id}`)?.classList.toggle("speaking", on);
}

// ---------- metrics ----------
function renderMetrics(m) {
  const items = [];
  const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
  const pct = (n) => `${(n * 100).toFixed(1)}%`;
  if (m.netProfit != null) items.push(["Net profit / mo", money(m.netProfit), m.netProfit <= 0 || m.netMargin < 0.05 ? "bad" : "good"]);
  if (m.contributionMargin != null) items.push(["Contribution margin", pct(m.contributionMargin), m.contributionMargin < 0.2 ? "bad" : "good"]);
  if (m.mer != null) items.push(["MER", `${m.mer.toFixed(2)}x`, m.breakevenRoas && m.mer < m.breakevenRoas * 1.3 ? "bad" : "good"]);
  if (m.breakevenRoas != null) items.push(["Break-even ROAS", `${m.breakevenRoas.toFixed(2)}x`, ""]);
  if (m.cac != null) items.push(["Blended CAC", `$${m.cac.toFixed(2)}`, ""]);
  if (m.grossMargin != null) items.push(["Gross margin", pct(m.grossMargin), m.grossMargin < 0.5 ? "bad" : "good"]);
  metricsEl.hidden = items.length === 0;
  metricsEl.innerHTML = items.map(([k, v, c]) => `<div class="metric ${c}"><b>${v}</b><span>${k}</span></div>`).join("");
}

// ---------- verdict ----------
function renderVerdict(v) {
  const color = v.overall_score >= 70 ? "#7bd88f" : v.overall_score >= 45 ? "#f5b942" : "#ff6b5b";
  const C = 2 * Math.PI * 36;
  const dash = (Math.max(0, Math.min(100, v.overall_score)) / 100) * C;
  const t = v.tally || {};
  verdictEl.hidden = false;
  verdictEl.innerHTML = `
    <div class="v-top">
      <div class="gauge">
        <svg width="86" height="86"><circle cx="43" cy="43" r="36" stroke="#1b2b48" stroke-width="8" fill="none"/>
        <circle cx="43" cy="43" r="36" stroke="${color}" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="${dash} ${C}"/></svg>
        <b>${v.overall_score}</b><small>/ 100</small>
      </div>
      <div>
        <p class="v-headline">${esc(v.headline)}</p>
        <div class="v-meta">
          <span>Confidence ${v.confidence}/10</span> ·
          <span class="chip ENDORSE">${t.endorse ?? 0} ENDORSE</span>
          <span class="chip AMEND">${t.amend ?? 0} AMEND</span>
          <span class="chip OBJECT">${t.object ?? 0} OBJECT</span>
        </div>
      </div>
    </div>
    <div class="v-cols">
      <div>
        <h3>THE PLAN, IN ORDER</h3>
        <ol class="prio">${(v.priorities || [])
          .map((p) => {
            const who = byId(p.owner);
            return `<li style="--c:${who?.color || "#9aa7ff"}"><div>${esc(p.action)}<div class="meta">${esc(who?.name || p.owner)} · ${esc(p.impact)} impact · ${esc(p.timeframe)}</div></div></li>`;
          })
          .join("")}</ol>
      </div>
      <div>
        <h3>WATCH OUT</h3>
        ${(v.watch_out || [])
          .map((q) => {
            const who = byId(q.advisor);
            return `<div class="quote" style="--c:${who?.color || "#9aa7ff"}"><small>${esc(who?.name || q.advisor)}</small>“${esc(q.quote)}”</div>`;
          })
          .join("")}
      </div>
    </div>
    <p class="v-close">${esc(v.closing_line || "")}</p>
    <div class="v-actions">
      <button type="button" id="copy-plan">Copy plan as Markdown</button>
      <button type="button" id="hide-verdict">Hide verdict</button>
    </div>`;
  $("#hide-verdict").onclick = () => (verdictEl.hidden = true);
  $("#copy-plan").onclick = async () => {
    await navigator.clipboard.writeText(planMarkdown(v));
    $("#copy-plan").textContent = "Copied ✓";
  };
}

function planMarkdown(v) {
  const lines = [`# Roast Room verdict: ${v.overall_score}/100`, "", v.headline, "", "## Plan"];
  (v.priorities || []).forEach((p, i) => lines.push(`${i + 1}. ${p.action} (${byId(p.owner)?.name || p.owner}, ${p.impact}, ${p.timeframe})`));
  lines.push("", "## Watch out");
  (v.watch_out || []).forEach((q) => lines.push(`- ${byId(q.advisor)?.name || q.advisor}: "${q.quote}"`));
  lines.push("", `> ${v.closing_line}`);
  return lines.join("\n");
}

// ---------- the roast ----------
function setStatus(text, live) {
  statusText.textContent = text;
  statusEl.classList.toggle("live", Boolean(live));
}

function showToast(msg) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => (toast.hidden = true), 9000);
}

async function startRoast() {
  const body = readForm();
  const demo = demoToggle.checked;
  const key = demo ? "" : userKey();
  if (!demo && !hasKey && !key) {
    $("#keybox").open = true;
    keyInput.focus();
    showToast("Add your Claude API key, or tick Demo mode to try it free.");
    return;
  }
  if (key && !/^sk-ant-[\w-]{20,}$/.test(key)) {
    showToast("That doesn't look like a Claude API key. It should start with sk-ant-.");
    return;
  }
  if (!body.product && !body.storeUrl && !demo) {
    showToast("Add at least a product or a store URL (or load the sample store).");
    return;
  }

  state = { text: {}, phase: null };
  renderCards();
  scene.reset();
  verdictEl.hidden = true;
  caption.classList.add("hide");
  goBtn.disabled = true;
  goBtn.textContent = "Roast in progress…";
  setStatus("CONVENING THE PANEL", true);

  try {
    const res = await fetch(`/api/roast${demo ? "?demo=1" : ""}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { "x-anthropic-key": key } : {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) throw new Error(`Server returned ${res.status}`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (line) handle(JSON.parse(line.slice(6)));
      }
    }
  } catch (err) {
    showToast(err.message || String(err));
  } finally {
    goBtn.disabled = false;
    goBtn.textContent = "Roast again";
    for (const p of personas) setSpeaking(p.id, false);
    scene.setSpeaking("chair", false);
    if (state.phase !== "verdict-done") setStatus("THE ROOM IS OPEN", false);
  }
}

function handle(evt) {
  switch (evt.type) {
    case "metrics":
      renderMetrics(evt.metrics);
      break;
    case "phase":
      state.phase = evt.phase;
      setStatus(evt.label.toUpperCase(), true);
      if (evt.phase === "round2") personas.forEach((p) => scene.setBubble(p.id, ""));
      break;
    case "speaking":
      setSpeaking(evt.persona, true);
      break;
    case "delta": {
      const k = `${evt.persona}:${evt.round}`;
      state.text[k] = (state.text[k] || "") + evt.text;
      const text = state.text[k];
      if (evt.round === 1) renderRound1(evt.persona, text, false);
      else renderRound2(evt.persona, text, false);
      const stance = evt.round === 2 ? parseRound2(text).stance : null;
      scene.setBubble(evt.persona, text, stance);
      break;
    }
    case "persona_done": {
      setSpeaking(evt.persona, false);
      const text = evt.result.text;
      if (evt.round === 1) {
        const r = renderRound1(evt.persona, text, true);
        scene.setScore(evt.persona, r.score);
        scene.setBubble(evt.persona, r.oneLiner || text);
      } else {
        const r = renderRound2(evt.persona, text, true);
        scene.setBubble(evt.persona, r.take, r.stance);
      }
      break;
    }
    case "persona_error":
      setSpeaking(evt.persona, false);
      if (evt.persona === "chair") showToast(`Chair: ${evt.message}`);
      else cardBody(evt.persona).insertAdjacentHTML("beforeend", `<p class="err">${esc(evt.message)}</p>`);
      break;
    case "verdict":
      scene.setSpeaking("chair", false);
      scene.setVerdict(evt.verdict.overall_score);
      personas.forEach((p) => scene.setBubble(p.id, ""));
      renderVerdict(evt.verdict);
      state.phase = "verdict-done";
      setStatus(`VERDICT: ${evt.verdict.overall_score}/100`, false);
      break;
    case "usage":
      costEl.textContent =
        evt.estCostUsd == null
          ? `${evt.model} · ${evt.inputTokens + evt.outputTokens} tokens`
          : `${evt.model} · ${(evt.inputTokens / 1000).toFixed(1)}k in / ${(evt.outputTokens / 1000).toFixed(1)}k out · ~$${evt.estCostUsd.toFixed(3)}`;
      break;
    case "site":
      if (!evt.fetched) hint.textContent = "Couldn't read the store homepage; the panel is working from your brief only.";
      break;
    case "error":
      showToast(evt.message);
      break;
  }
}
