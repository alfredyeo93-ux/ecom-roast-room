// Turns the form input into a store brief plus computed unit economics, so the
// advisors argue about strategy instead of doing arithmetic.

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const clip = (s, max) => String(s ?? "").trim().slice(0, max);

export function normaliseInput(body = {}) {
  const p = body.pnl || {};
  return {
    storeName: clip(body.storeName, 120),
    storeUrl: clip(body.storeUrl, 300),
    product: clip(body.product, 1500),
    price: num(body.price),
    offer: clip(body.offer, 1500),
    adCopy: clip(body.adCopy, 3000),
    audience: clip(body.audience, 600),
    notes: clip(body.notes, 1500),
    pnl: {
      revenue: num(p.revenue),
      cogs: num(p.cogs),
      shipping: num(p.shipping),
      adSpend: num(p.adSpend),
      opex: num(p.opex),
      aov: num(p.aov),
      conversionRate: num(p.conversionRate),
      refundRate: num(p.refundRate),
    },
  };
}

const r2 = (n) => Math.round(n * 100) / 100;
const pct = (n) => `${r2(n * 100)}%`;
const usd = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

export function computeMetrics(input) {
  const { revenue, cogs, shipping, adSpend, opex, aov, conversionRate, refundRate } = input.pnl;
  const m = {};
  if (revenue && aov) m.orders = Math.round(revenue / aov);
  if (revenue != null && refundRate != null) m.netRevenue = revenue * (1 - refundRate / 100);
  const net = m.netRevenue ?? revenue;
  if (net && cogs != null) {
    m.grossProfit = net - cogs - (shipping ?? 0);
    m.grossMargin = m.grossProfit / net;
  }
  if (m.grossProfit != null && adSpend != null) {
    m.contribution = m.grossProfit - adSpend;
    m.contributionMargin = m.contribution / net;
  }
  if (m.contribution != null && opex != null) {
    m.netProfit = m.contribution - opex;
    m.netMargin = m.netProfit / net;
  }
  if (revenue && adSpend) m.mer = revenue / adSpend;
  if (adSpend && m.orders) m.cac = adSpend / m.orders;
  if (m.grossMargin) m.breakevenRoas = 1 / m.grossMargin;
  if (conversionRate && aov) m.revenuePerVisitor = (conversionRate / 100) * aov;
  return m;
}

export function metricsLines(m) {
  const lines = [];
  if (m.orders != null) lines.push(`Orders/month (revenue / AOV): ~${m.orders}`);
  if (m.netRevenue != null) lines.push(`Revenue after refunds: ${usd(m.netRevenue)}`);
  if (m.grossMargin != null) lines.push(`Gross profit after COGS+shipping: ${usd(m.grossProfit)} (${pct(m.grossMargin)} margin)`);
  if (m.contribution != null) lines.push(`Contribution after ads: ${usd(m.contribution)} (${pct(m.contributionMargin)})`);
  if (m.netProfit != null) lines.push(`Net profit after opex: ${usd(m.netProfit)} (${pct(m.netMargin)})`);
  if (m.mer != null) lines.push(`MER (revenue / ad spend): ${r2(m.mer)}x`);
  if (m.breakevenRoas != null) lines.push(`Break-even ROAS: ${r2(m.breakevenRoas)}x`);
  if (m.cac != null) lines.push(`Blended CAC: $${r2(m.cac)}`);
  if (m.revenuePerVisitor != null) lines.push(`Revenue per visitor: $${r2(m.revenuePerVisitor)}`);
  return lines;
}

export function buildBrief(input, metrics, siteSnippet) {
  const p = input.pnl;
  const v = (x, fmt = (y) => y) => (x == null || x === "" ? "not given" : fmt(x));
  return [
    `# Store brief`,
    `Store: ${v(input.storeName)}  |  URL: ${v(input.storeUrl)}`,
    `Product: ${v(input.product)}`,
    `Price: ${v(input.price, (x) => `$${x}`)}`,
    `Offer: ${v(input.offer)}`,
    `Target customer: ${v(input.audience)}`,
    `Ad copy currently running:\n"""\n${v(input.adCopy)}\n"""`,
    input.notes ? `Owner notes: ${input.notes}` : "",
    `\n# Monthly P&L (owner-reported)`,
    `Revenue ${v(p.revenue, usd)} | COGS ${v(p.cogs, usd)} | Shipping/fulfilment ${v(p.shipping, usd)} | Ad spend ${v(p.adSpend, usd)} | Opex ${v(p.opex, usd)}`,
    `AOV ${v(p.aov, (x) => `$${x}`)} | Conversion rate ${v(p.conversionRate, (x) => `${x}%`)} | Refund rate ${v(p.refundRate, (x) => `${x}%`)}`,
    `\n# Computed metrics`,
    ...(metricsLines(metrics).length ? metricsLines(metrics) : ["(not enough numbers to compute)"]),
    siteSnippet ? `\n# Store homepage text (auto-fetched, may be partial)\n"""\n${siteSnippet}\n"""` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// Best-effort homepage fetch: title, meta description and visible text, capped.
export async function fetchStoreSnippet(url, { timeoutMs = 8000, maxChars = 2500 } = {}) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return "";
  }
  if (!/^https?:$/.test(u.protocol)) return "";
  try {
    const res = await fetch(u, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "Mozilla/5.0 (EcomRoastRoom local audit)" },
      redirect: "follow",
    });
    if (!res.ok) return "";
    const html = (await res.text()).slice(0, 400_000);
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
    const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || [])[1] || "";
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    return `Title: ${title.trim()}\nMeta description: ${desc.trim()}\nText: ${text}`.slice(0, maxChars);
  } catch {
    return "";
  }
}
