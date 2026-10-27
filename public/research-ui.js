// "Ads & customer research" panel: loads a research bundle (from /roast-research, a CSV
// export, or the sample), the post-purchase survey, and builds the Claude Code command.
import {
  normalizeResearch, summarizeAds, fromAdsManagerCsv, parseCsv, parseSurvey, adLibraryLink, STAGE_LABEL,
} from "/lib/ads.js";

const $ = (s) => document.querySelector(s);
let bundle = null; // { source, account, ads, competitors, ... } without the survey
let toast = () => {};

const money = (n) => (n == null ? "–" : `$${Math.round(n).toLocaleString("en-US")}`);
const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function setupResearch({ showToast }) {
  toast = showToast;
  $("#use-research").onclick = loadLatest;
  $("#clear-research").onclick = () => setBundle(null);
  $("#ads-file").onchange = (e) => readFile(e.target.files[0], loadFile);
  $("#survey-file").onchange = (e) =>
    readFile(e.target.files[0], (text, name) => {
      const lines = parseSurvey(text, /\.csv$/i.test(name));
      $("#survey").value = lines.join("\n");
      toast(`Loaded ${lines.length} survey answers.`);
    });
  $("#ads-link").oninput = $("#niche").oninput = updateCommand;
  $("#copy-cmd").onclick = async () => {
    await navigator.clipboard.writeText($("#research-cmd").textContent);
    $("#copy-cmd").textContent = "Copied";
    setTimeout(() => ($("#copy-cmd").textContent = "Copy"), 1500);
  };
  updateCommand();
  setBundle(null);
}

function readFile(file, cb) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => cb(String(r.result), file.name);
  r.readAsText(file);
}

function updateCommand() {
  const link = $("#ads-link").value.trim();
  const niche = $("#niche").value.trim();
  const act = link.match(/act=(\d+)/)?.[1] || (/^\d+$/.test(link) ? link : "");
  $("#research-cmd").textContent = `/roast-research ${act || link || "<Ads Manager link>"} | ${niche || "<niche>"}`;
  $("#adlib-link").href = niche ? adLibraryLink(niche) : "https://www.facebook.com/ads/library/";
}

async function loadLatest() {
  const res = await fetch("/api/research");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return toast(data.error || "No research file found.");
  setBundle(data.research, `research/${data.file}`);
  if (data.research.niche) $("#niche").value = data.research.niche;
  if (data.research.survey?.length && !$("#survey").value) $("#survey").value = data.research.survey.join("\n");
  updateCommand();
}

function loadFile(text, name) {
  try {
    if (/\.json$/i.test(name)) {
      const raw = JSON.parse(text);
      setBundle(normalizeResearch(raw), name);
      if (raw.niche) $("#niche").value = raw.niche;
      if (raw.survey?.length && !$("#survey").value) $("#survey").value = [].concat(raw.survey).join("\n");
      updateCommand();
    } else {
      const ads = fromAdsManagerCsv(parseCsv(text));
      if (!ads.length) return toast("That CSV has no ad rows. Export an ad-level report from Ads Manager (Ad name, Amount spent, Purchases…).");
      setBundle(normalizeResearch({ source: "ads-manager-csv", ads, period: "from your CSV export" }), name);
    }
  } catch (err) {
    toast(`Couldn't read ${name}: ${err.message}`);
  }
}

export async function loadSampleResearch() {
  const raw = await fetch("/sample-research.json").then((r) => r.json());
  setBundle(normalizeResearch(raw), "sample data");
  $("#niche").value = raw.niche || "";
  $("#survey").value = (raw.survey || []).join("\n");
  updateCommand();
}

function setBundle(b, label) {
  bundle = b;
  const status = $("#research-status");
  const mini = $("#funnel-mini");
  if (!b) {
    status.textContent = "No ad data loaded.";
    mini.hidden = true;
    return;
  }
  const s = summarizeAds(b.ads);
  const parts = [];
  if (b.ads.length) parts.push(`${b.ads.length} ads, ${money(s.totals.spend)} spend, ${s.totals.purchases} purchases, ROAS ${s.totals.roas ?? "–"}x`);
  if (b.competitors.ads.length) parts.push(`${b.competitors.ads.length} competitor ads`);
  status.innerHTML = `<b>Loaded ${esc(label)}</b>${b.account ? ` · ${esc(b.account)}` : ""}<br>${esc(parts.join(" · ") || "no ads in file")}`;
  const stages = Object.entries(s.byStage);
  mini.hidden = !stages.length;
  mini.innerHTML =
    stages
      .map(
        ([st, v]) => `<div class="fm ${st}" title="${esc(STAGE_LABEL[st])}"><b>${st}</b><span>${v.share ?? 0}% of spend</span>
          <span>ROAS ${v.roas ?? "–"}x</span><span>CPA ${money(v.cpa)}</span></div>`
      )
      .join("") + (s.notes.length ? `<p class="fm-note">${esc(s.notes.join(" "))}</p>` : "");
}

/** What gets sent with the roast (and into the PDF report). */
export function currentResearch() {
  const survey = parseSurvey($("#survey").value);
  if (!bundle && !survey.length) return null;
  return {
    ...(bundle || { source: "survey-only", ads: [], competitors: { ads: [], pages: [] } }),
    niche: $("#niche").value.trim() || bundle?.niche || "",
    survey,
  };
}
