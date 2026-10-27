// Ad data, post-purchase survey and competitor research: parsing, funnel staging and
// the summaries the advisors read. Pure functions with no Node imports, so the browser
// loads the same file (served at /lib/ads.js) to preview what will be sent.

export const STAGES = ["TOF", "MOF", "BOF", "ALL"];
export const STAGE_LABEL = {
  TOF: "Top of funnel (cold prospecting)",
  MOF: "Middle of funnel (warm: engagers, video viewers)",
  BOF: "Bottom of funnel (retargeting: visitors, add to cart)",
  ALL: "All-funnel (Advantage+ / broad shopping)",
};

const LIMITS = { ads: 300, competitors: 60, surveyChars: 8000, surveyItems: 200, text: 300 };

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "object" && "value" in v) return num(v.value);
  const n = Number(String(v).replace(/[$,%\s]/g, "").replace(/[A-Z]{3}$/i, ""));
  return Number.isFinite(n) ? n : null;
};
const str = (v, max = LIMITS.text) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

// ---------- funnel staging ----------
const BOF_RE = /\b(bof|retarget\w*|remarket\w*|rt|dpa|catalog|atc|add.?to.?cart|cart|checkout|ic|visitors?|website.?visit\w*|abandon\w*|purchasers?|past.?buyers?|customers?)\b/i;
const MOF_RE = /\b(mof|warm|engag\w*|video.?view\w*|vv|ig.?engag\w*|fb.?engag\w*|consideration|followers?|page.?likes?|social.?proof)\b/i;
const TOF_RE = /\b(tof|prospect\w*|cold|broad|interest\w*|lal|lookalike|acquisition|awareness|reach|new.?customers?|cbo|abo|testing|test)\b/i;
const ALL_RE = /\b(asc|advantage\+?|adv\+|advantage.?shopping)\b/i;

/** Best guess from names and objective. The owner can override `stage` in the data. */
export function classifyStage(ad) {
  if (STAGES.includes(String(ad.stage || "").toUpperCase())) return String(ad.stage).toUpperCase();
  const hay = `${ad.campaign || ""} | ${ad.adset || ""}`;
  if (BOF_RE.test(hay)) return "BOF";
  if (MOF_RE.test(hay)) return "MOF";
  if (ALL_RE.test(hay)) return "ALL";
  if (TOF_RE.test(hay)) return "TOF";
  const obj = String(ad.objective || "").toUpperCase();
  if (/AWARENESS|REACH|VIDEO_VIEWS|ENGAGEMENT/.test(obj)) return "TOF";
  return "TOF"; // most unlabelled sales campaigns are prospecting
}

// ---------- normalising sources ----------
function normAd(a) {
  const ad = {
    name: str(a.name),
    campaign: str(a.campaign),
    adset: str(a.adset),
    objective: str(a.objective, 40),
    status: str(a.status, 40),
    created: str(a.created, 40),
    spend: num(a.spend) ?? 0,
    impressions: num(a.impressions) ?? 0,
    clicks: num(a.clicks),
    ctr: num(a.ctr),
    cpm: num(a.cpm),
    addToCart: num(a.addToCart),
    purchases: num(a.purchases) ?? 0,
    revenue: num(a.revenue) ?? 0,
    roas: num(a.roas),
    videoPlays3s: num(a.videoPlays3s),
    thruplays: num(a.thruplays),
    stage: a.stage ? String(a.stage).toUpperCase() : "",
  };
  if (ad.roas == null && ad.spend > 0 && ad.revenue) ad.roas = ad.revenue / ad.spend;
  if (ad.ctr == null && ad.impressions && ad.clicks != null) ad.ctr = (ad.clicks / ad.impressions) * 100;
  if (ad.cpm == null && ad.impressions) ad.cpm = (ad.spend / ad.impressions) * 1000;
  ad.stage = classifyStage(ad);
  return ad;
}

/** Rows from the Meta Ads connector's ads_get_ad_entities (level=ad). */
export function fromMetaConnector(entities) {
  return entities.map((e) =>
    normAd({
      name: e.name,
      campaign: e.campaign_name,
      adset: e.adset_name,
      objective: e.objective,
      status: e.effective_status,
      created: e.created_time,
      spend: e.amount_spent,
      impressions: e.impressions,
      clicks: e.link_click,
      ctr: e.ctr,
      cpm: e.cpm,
      addToCart: e.omni_add_to_cart,
      purchases: e.omni_purchase,
      revenue: e.omni_purchase_values,
      roas: e.purchase_roas,
      videoPlays3s: e["3_second_video_plays"] ?? e.video_continuous_2_sec_watched_actions,
      thruplays: e.video_thruplay_watched_actions,
    })
  );
}

// ---------- CSV ----------
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head = [], ...body] = rows.filter((r) => r.some((x) => x.trim() !== ""));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])));
}

function pick(row, ...patterns) {
  const keys = Object.keys(row);
  for (const p of patterns) {
    const k = keys.find((key) => p.test(key));
    if (k && row[k] !== "") return row[k];
  }
  return null;
}

/** An ad-level report exported from Meta Ads Manager (Reports → Export → CSV). */
export function fromAdsManagerCsv(rows) {
  return rows
    .map((r) =>
      normAd({
        name: pick(r, /^ad name$/i, /^ad$/i),
        campaign: pick(r, /^campaign name$/i, /^campaign$/i),
        adset: pick(r, /^ad set name$/i, /^ad set$/i),
        objective: pick(r, /objective/i),
        status: pick(r, /delivery/i, /status/i),
        spend: pick(r, /^amount spent/i, /^spend/i),
        impressions: pick(r, /^impressions$/i),
        clicks: pick(r, /^link clicks$/i, /^clicks \(all\)$/i),
        ctr: pick(r, /^ctr \(link/i, /^ctr/i),
        cpm: pick(r, /^cpm/i),
        addToCart: pick(r, /adds? to cart/i),
        purchases: pick(r, /^purchases$/i, /^results$/i),
        revenue: pick(r, /purchases conversion value/i, /conversion value/i),
        roas: pick(r, /purchase roas/i, /^roas/i),
        videoPlays3s: pick(r, /3-second video plays/i),
        thruplays: pick(r, /thruplays/i),
        stage: pick(r, /^stage$/i, /^funnel/i),
      })
    )
    .filter((a) => a.name || a.campaign);
}

/** Survey answers from pasted text (one answer per line) or a CSV (picks the longest free-text column). */
export function parseSurvey(text, isCsv = false) {
  let items;
  if (isCsv) {
    const rows = parseCsv(text);
    const cols = Object.keys(rows[0] || {});
    const best = cols
      .map((c) => ({ c, len: rows.reduce((n, r) => n + String(r[c] || "").length, 0) }))
      .sort((a, b) => b.len - a.len)[0];
    items = best ? rows.map((r) => r[best.c]) : [];
  } else {
    items = String(text || "").split(/\r?\n/);
  }
  const out = [];
  let total = 0;
  for (const it of items) {
    const s = str(it, 400);
    if (s.length < 3) continue;
    if (total + s.length > LIMITS.surveyChars || out.length >= LIMITS.surveyItems) break;
    out.push(s);
    total += s.length;
  }
  return out;
}

// ---------- competitors ----------
/** Ad Library results ranked by how long they've run and how many variants are live (Meta doesn't publish spend). */
export function rankCompetitors(list, nowSec = Date.now() / 1000) {
  const items = list.map((a) => ({
    page: str(a.page || a.page_name, 120),
    pageId: str(a.pageId || a.page_id, 40),
    title: str(a.title || a.ad_creative_link_title || a.body, 200),
    body: str(a.body || a.ad_creative_body, 400),
    started: a.started || (a.ad_delivery_start_time ? new Date(a.ad_delivery_start_time * 1000).toISOString().slice(0, 10) : ""),
    url: str(a.url || a.ad_snapshot_url, 200),
    startSec: a.ad_delivery_start_time || (a.started ? Date.parse(a.started) / 1000 : null),
  }));
  // One row per page + headline, dated from its oldest live variant.
  const groups = new Map();
  for (const it of items) {
    const key = `${it.page}|${it.title}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { ...it, variants: 1 });
    else {
      g.variants++;
      if (it.startSec && (!g.startSec || it.startSec < g.startSec)) Object.assign(g, { startSec: it.startSec, started: it.started, url: it.url });
    }
  }
  const ranked = [...groups.values()].map((g) => {
    const days = g.startSec ? Math.max(0, Math.round((nowSec - g.startSec) / 86400)) : null;
    // Spend proxy: days running, with each extra live variant counted like a week of runtime.
    return { ...g, daysActive: days, signal: (days ?? 0) + 7 * (g.variants - 1) };
  });
  ranked.sort((a, b) => b.signal - a.signal);
  const pages = {};
  for (const it of items) pages[it.page] = (pages[it.page] || 0) + 1;
  return {
    ads: ranked.slice(0, LIMITS.competitors).map(({ startSec, ...rest }) => rest),
    pages: Object.entries(pages).map(([page, activeAds]) => ({ page, activeAds })).sort((a, b) => b.activeAds - a.activeAds),
  };
}

export function adLibraryLink(query, country = "US") {
  const q = encodeURIComponent(String(query || "").trim());
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${encodeURIComponent(country)}&q=${q}&search_type=keyword_unordered`;
}

// ---------- research bundle ----------
/** Cleans and caps a research bundle (from the Claude Code command, a CSV upload, or the sample). */
export function normalizeResearch(raw = {}) {
  const ads = Array.isArray(raw.ads) ? raw.ads.slice(0, LIMITS.ads).map(normAd) : [];
  const comp = raw.competitors?.ads ? raw.competitors : rankCompetitors(Array.isArray(raw.competitors) ? raw.competitors : []);
  const survey = Array.isArray(raw.survey) ? parseSurvey(raw.survey.join("\n")) : parseSurvey(raw.survey || "");
  return {
    source: str(raw.source, 40) || "upload",
    account: str(raw.account?.name || raw.account, 120),
    currency: str(raw.currency || raw.account?.currency || "USD", 8),
    period: str(raw.period || "last 30 days", 60),
    niche: str(raw.niche, 120),
    generatedAt: str(raw.generatedAt, 40),
    ads,
    competitors: {
      ads: (comp.ads || []).slice(0, LIMITS.competitors).map((a) => ({
        page: str(a.page, 120), title: str(a.title, 200), body: str(a.body, 400), started: str(a.started, 20),
        daysActive: num(a.daysActive), variants: num(a.variants) ?? 1, url: str(a.url, 200),
      })),
      pages: (comp.pages || []).slice(0, 20),
      note: "Meta does not publish spend for commercial ads, so competitor ads are ranked by a spend proxy: days running, with each extra live variant counted like a week of runtime.",
    },
    survey,
  };
}

function sum(list, f) {
  return list.reduce((n, a) => n + (f(a) || 0), 0);
}

export function summarizeAds(ads, minSpendForRank = 20) {
  const byStage = {};
  for (const st of STAGES) {
    const list = ads.filter((a) => a.stage === st);
    if (!list.length) continue;
    const spend = sum(list, (a) => a.spend);
    const imps = sum(list, (a) => a.impressions);
    const clicks = sum(list, (a) => a.clicks);
    const revenue = sum(list, (a) => a.revenue);
    const thru = sum(list, (a) => a.thruplays);
    const v3 = sum(list, (a) => a.videoPlays3s);
    byStage[st] = {
      ads: list.length,
      spend: r2(spend),
      share: null,
      purchases: sum(list, (a) => a.purchases),
      revenue: r2(revenue),
      roas: spend ? r2(revenue / spend) : null,
      ctr: imps ? r2((clicks / imps) * 100) : null,
      cpm: imps ? r2((spend / imps) * 1000) : null,
      cpa: sum(list, (a) => a.purchases) ? r2(spend / sum(list, (a) => a.purchases)) : null,
      hookRate: imps && v3 ? r2((v3 / imps) * 100) : null,
      holdRate: imps && thru ? r2((thru / imps) * 100) : null,
    };
  }
  const total = sum(ads, (a) => a.spend);
  for (const st of Object.keys(byStage)) byStage[st].share = total ? r2((byStage[st].spend / total) * 100) : null;
  const ranked = ads.filter((a) => a.spend >= minSpendForRank);
  const byRoas = [...ranked].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0) || (b.ctr ?? 0) - (a.ctr ?? 0));
  const totals = {
    spend: r2(total),
    revenue: r2(sum(ads, (a) => a.revenue)),
    purchases: sum(ads, (a) => a.purchases),
    ads: ads.length,
    roas: total ? r2(sum(ads, (a) => a.revenue) / total) : null,
  };
  const notes = [];
  if (ads.length && !byStage.BOF) notes.push("No bottom-of-funnel (retargeting) campaigns found: every dollar is going to cold traffic.");
  if (ads.length && !byStage.MOF) notes.push("No middle-of-funnel campaigns found.");
  const lowSpend = ads.filter((a) => a.spend < 5).length;
  if (lowSpend > ads.length / 2) notes.push(`${lowSpend} of ${ads.length} ads spent under $5, so most creatives never got a fair test.`);
  return { totals, byStage, top: byRoas.slice(0, 5), bottom: [...ranked].sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0)).slice(0, 3), notes };
}

const money = (n, cur = "USD") => (n == null ? "–" : `${cur === "USD" ? "$" : cur + " "}${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
const fmt = (n, suffix = "") => (n == null ? "–" : `${n}${suffix}`);

/** The block of text the advisors and the Chair read. */
export function researchBrief(research) {
  if (!research) return "";
  const out = [];
  const cur = research.currency || "USD";
  if (research.ads?.length) {
    const s = summarizeAds(research.ads);
    out.push(`\n# Meta ads (${research.period}${research.account ? `, account "${research.account}"` : ""}, source: ${research.source})`);
    out.push(`Total: spend ${money(s.totals.spend, cur)}, ${s.totals.purchases} purchases, revenue ${money(s.totals.revenue, cur)}, ROAS ${fmt(s.totals.roas, "x")}, ${s.totals.ads} ads.`);
    out.push(`By funnel stage (staged from campaign/ad set names; treat as a best guess):`);
    for (const [st, v] of Object.entries(s.byStage)) {
      out.push(`- ${st} (${STAGE_LABEL[st]}): ${v.ads} ads, spend ${money(v.spend, cur)} (${fmt(v.share, "%")} of spend), ${v.purchases} purchases, ROAS ${fmt(v.roas, "x")}, CPA ${money(v.cpa, cur)}, CTR ${fmt(v.ctr, "%")}, CPM ${money(v.cpm, cur)}${v.hookRate != null ? `, hook rate ${v.hookRate}%` : ""}${v.holdRate != null ? `, ThruPlay rate ${v.holdRate}%` : ""}`);
    }
    if (s.notes.length) out.push(`Flags: ${s.notes.join(" ")}`);
    const line = (a) => `"${a.name}" [${a.stage}] (campaign "${a.campaign}"): spend ${money(a.spend, cur)}, ROAS ${fmt(a.roas == null ? null : Math.round(a.roas * 100) / 100, "x")}, ${a.purchases} purchases, CTR ${fmt(a.ctr == null ? null : Math.round(a.ctr * 100) / 100, "%")}, ATC ${fmt(a.addToCart)}`;
    if (s.top.length) out.push(`Best ads (spend ≥ $20, by ROAS):\n${s.top.map((a) => `- ${line(a)}`).join("\n")}`);
    if (s.bottom.length) out.push(`Weakest ads (spend ≥ $20):\n${s.bottom.map((a) => `- ${line(a)}`).join("\n")}`);
  }
  if (research.survey?.length) {
    out.push(`\n# Post-purchase survey answers (${research.survey.length}, customers' own words)\n"""\n${research.survey.map((s) => `- ${s}`).join("\n")}\n"""`);
  }
  const comp = research.competitors?.ads || [];
  if (comp.length) {
    out.push(`\n# Competitor ads in this niche (Meta Ad Library, active${research.niche ? `, search: "${research.niche}"` : ""})`);
    out.push(research.competitors.note);
    out.push(comp.slice(0, 15).map((a) => `- ${a.page}: "${a.title}"${a.body ? ` / "${a.body.slice(0, 160)}"` : ""} (running ${fmt(a.daysActive)} days, ${a.variants} live variant${a.variants === 1 ? "" : "s"})`).join("\n"));
  }
  return out.join("\n");
}
