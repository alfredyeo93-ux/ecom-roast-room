// Printable roast report. The Roast Room tab stores a snapshot in localStorage
// ("roastroom.report"); this page renders it and opens the browser's print dialog,
// where "Save as PDF" produces the file. No API key is ever part of the snapshot.
const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const STAGE_NAME = { TOF: "Top of funnel", MOF: "Middle of funnel", BOF: "Bottom of funnel", ALL: "All-funnel" };

let data = null;
try {
  data = JSON.parse(localStorage.getItem("roastroom.report") || "null");
} catch {
  data = null;
}

document.getElementById("save-pdf").onclick = () => window.print();

if (data?.verdict) {
  render(data);
  document.title = `Roast Room report: ${data.brief?.storeName || "your store"}`;
  setTimeout(() => window.print(), 600);
}

function growth(v, research) {
  const parts = [];
  const stages = Object.entries(research?.byStage || {});
  if (stages.length) {
    parts.push(`<h2>Your ads by funnel stage</h2>
      <p class="sub small">${esc(research.account || "Your account")} · ${esc(research.period || "")} · ${research.totals?.ads ?? 0} ads, ${money(research.totals?.spend ?? 0)} spend, ROAS ${research.totals?.roas ?? "–"}x</p>
      <table class="ftable"><thead><tr><th>Stage</th><th>Share of spend</th><th>Spend</th><th>Purchases</th><th>ROAS</th><th>CPA</th><th>CTR</th></tr></thead><tbody>${stages
        .map(([st, s]) => `<tr><td><b>${esc(st)}</b> <small>${esc(STAGE_NAME[st] || "")}</small></td><td>${s.share ?? "–"}%</td><td>${money(s.spend)}</td><td>${s.purchases}</td><td>${s.roas ?? "–"}x</td><td>${s.cpa == null ? "–" : money(s.cpa)}</td><td>${s.ctr ?? "–"}%</td></tr>`)
        .join("")}</tbody></table>
      ${(research.notes || []).length ? `<p class="flag">${esc(research.notes.join(" "))}</p>` : ""}`);
  }
  if ((v.funnel || []).length) {
    parts.push(`<h2>What's working, by stage</h2><div class="fcards">${v.funnel
      .map((f) => `<div class="fcard"><div><b>${esc(f.stage)}</b> <span class="badge ${f.verdict === "double down" ? "go" : f.verdict === "cut" ? "stop" : "amend"}">${esc(f.verdict.toUpperCase())}</span></div><p>${esc(f.finding)}</p><p class="act">→ ${esc(f.action)}</p></div>`)
      .join("")}</div>`);
  }
  const voc = v.voice_of_customer || {};
  if (voc.themes?.length || voc.angles?.length) {
    parts.push(`<h2>Voice of customer → creative</h2>
      ${voc.themes?.length ? `<p class="sub small">Why customers bought${research?.surveyCount ? ` (from ${research.surveyCount} post-purchase survey answers)` : ""}:</p><ul class="why">${voc.themes.map((t) => `<li><b>${esc(t.theme)}</b> <span class="fix">“${esc(t.evidence)}”</span></li>`).join("")}</ul>` : ""}
      ${voc.angles?.length ? `<p class="sub small">Angles to brief into creative:</p><ol class="plan">${voc.angles.map((a) => `<li><div><b>${esc(a.angle)}</b>: “${esc(a.hook)}”<small>${esc(a.format)} · ${esc(a.stage)}</small></div></li>`).join("")}</ol>` : ""}`);
  }
  if ((v.test_next || []).length) {
    parts.push(`<h2>What to test next</h2><ol class="plan">${v.test_next
      .map((x) => `<li><div><b>${esc(x.what_they_do)}</b><small>${esc(x.source)} · ${esc(x.stage)}</small>Why: ${esc(x.why_it_works)}<br><span class="test">Test: ${esc(x.test_brief)}</span></div></li>`)
      .join("")}</ol>`);
  }
  if ((research?.competitors || []).length) {
    parts.push(`<p class="sub small">Competitor ads reviewed${research.niche ? ` for “${esc(research.niche)}”` : ""}: ${research.competitors
      .slice(0, 6)
      .map((c) => `${esc(c.page)}, “${esc(c.title.slice(0, 70))}” (${c.daysActive ?? "?"} days, ${c.variants} variant${c.variants === 1 ? "" : "s"})`)
      .join("; ")}. ${esc(research.competitorNote || "")}</p>`);
  }
  return parts.join("");
}

function render({ verdict: v, brief = {}, metrics, advisors = [], createdAt, demo, research }) {
  const byId = Object.fromEntries(advisors.map((a) => [a.id, a]));
  const t = v.tally || {};
  const score = v.overall_score;
  const call = score >= 70 ? ["SCALE", "go"] : score >= 45 ? ["FIX, THEN SCALE", "amend"] : ["FIX FIRST", "stop"];
  const date = new Date(createdAt || Date.now()).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const metricRows = [];
  if (metrics) {
    if (metrics.netProfit != null) metricRows.push(["Net profit / month", money(metrics.netProfit)]);
    if (metrics.contributionMargin != null) metricRows.push(["Contribution margin", pct(metrics.contributionMargin)]);
    if (metrics.mer != null) metricRows.push(["MER", `${metrics.mer.toFixed(2)}x`]);
    if (metrics.breakevenRoas != null) metricRows.push(["Break-even ROAS", `${metrics.breakevenRoas.toFixed(2)}x`]);
    if (metrics.cac != null) metricRows.push(["Blended CAC", `$${metrics.cac.toFixed(2)}`]);
    if (metrics.grossMargin != null) metricRows.push(["Gross margin", pct(metrics.grossMargin)]);
  }

  document.getElementById("report").innerHTML = `
    <header class="head">
      <div class="logo"><span>🔥</span> E-COM ROAST ROOM</div>
      <div class="head-r"><b>Roast report</b><small>${esc(date)}${demo ? " · demo roast" : ""}</small></div>
    </header>

    <p class="eyebrow">THE STORE</p>
    <h1>${esc(brief.storeName || "Your store")}</h1>
    <p class="sub">${esc([brief.product, brief.price ? `$${brief.price}` : "", brief.offer].filter(Boolean).join(" · "))}</p>

    <section class="call">
      <div class="call-top">
        <span class="badge ${call[1]}">${call[0]}</span>
        <span class="eyebrow">THE CHAIR'S VERDICT</span>
        <span class="score">${score}<small>/100</small></span>
      </div>
      <p class="headline">${esc(v.headline)}</p>
      <p class="meta">Confidence ${v.confidence}/10 · ${t.endorse ?? 0} endorse, ${t.amend ?? 0} amend, ${t.object ?? 0} object</p>
    </section>

    ${metricRows.length ? `<h2>Your numbers</h2><div class="metrics">${metricRows
      .map(([k, val]) => `<div><b>${esc(val)}</b><span>${esc(k)}</span></div>`)
      .join("")}</div>` : ""}

    <h2>Advisor scores</h2>
    <div class="scores">${advisors
      .map((a) => {
        const s = a.round1?.score ?? v.scores?.[a.id];
        return `<div class="srow">
          <span class="dot" style="background:${esc(a.color)}"></span>
          <span class="who"><b>${esc(a.name)}</b><small>inspired by ${esc(a.inspiredBy)}</small></span>
          <span class="bar"><i style="width:${s == null ? 0 : s * 10}%;background:${esc(a.color)}"></i></span>
          <span class="num">${s == null ? "–" : s}<small>/10</small></span>
        </div>`;
      })
      .join("")}</div>

    <h2>The plan, in order</h2>
    <ol class="plan">${(v.priorities || [])
      .map((p) => `<li><div>${esc(p.action)}<small>${esc(byId[p.owner]?.name || p.owner)} · ${esc(p.impact)} impact · ${esc(p.timeframe)}</small></div></li>`)
      .join("")}</ol>

    <h2>Why the council landed here</h2>
    <ul class="why">${advisors
      .filter((a) => a.round1?.oneLiner || a.round1?.fixes?.length)
      .map((a) => {
        const fix = a.round1.fixes?.[0]?.fix;
        const stance = a.round2?.stance ? ` <span class="chip ${a.round2.stance}">${a.round2.stance}</span>` : "";
        return `<li><b>${esc(a.name)}:</b>${stance} ${esc(a.round1.oneLiner || "")}${fix ? `<br><span class="fix">Top fix: ${esc(fix)}</span>` : ""}</li>`;
      })
      .join("")}</ul>

    ${(v.watch_out || []).length ? `<h2>Watch out</h2><div class="quotes">${v.watch_out
      .map((q) => `<blockquote><small>${esc(byId[q.advisor]?.name || q.advisor)}</small>“${esc(q.quote)}”</blockquote>`)
      .join("")}</div>` : ""}

    ${growth(v, research)}

    ${v.closing_line ? `<p class="closing">${esc(v.closing_line)}</p>` : ""}

    <footer>
      <span>The advisors are fictional AI characters inspired by published frameworks. They are not those people, do not speak for them, and this report is not endorsed by them. Advice is AI-generated; check the numbers before you act.</span>
      <span>E-com Roast Room · open source</span>
    </footer>`;
}
