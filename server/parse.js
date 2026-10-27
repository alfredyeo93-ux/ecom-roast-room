// Tolerant parsers for the advisors' plain-text formats. They work on partial
// text too, so the UI can call the same logic while a reply is still streaming.

function section(text, label, nextLabels) {
  const re = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n\\s*(?:${nextLabels.join("|")}):|$)`, "i");
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

export function parseRound1(text = "") {
  const roast = section(text, "ROAST", ["FIXES", "SCORE", "ONE-LINER"]);
  const fixesBlock = section(text, "FIXES", ["SCORE", "ONE-LINER"]);
  const fixes = fixesBlock
    .split(/\n(?=\s*\d+[.)]\s)/)
    .map((f) => f.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .map((f) => {
      const [fix, impact] = f.split(/\s+(?:--|—|–)\s+/);
      return { fix: (fix || "").trim(), impact: (impact || "").trim() };
    });
  const scoreM = text.match(/SCORE:\s*(\d{1,2})(?:\s*\/\s*10)?/i);
  const score = scoreM ? Math.max(0, Math.min(10, Number(scoreM[1]))) : null;
  const oneLiner = section(text, "ONE-LINER", ["ZZZ_NONE"]);
  return { roast: roast || (!fixesBlock ? text.trim() : ""), fixes, score, oneLiner };
}

export function parseRound2(text = "") {
  const stanceM = text.match(/STANCE:\s*(ENDORSE|AMEND|OBJECT)/i);
  return {
    stance: stanceM ? stanceM[1].toUpperCase() : null,
    target: section(text, "TARGET", ["TAKE"]),
    take: section(text, "TAKE", ["ZZZ_NONE"]) || (!stanceM ? text.trim() : ""),
  };
}
