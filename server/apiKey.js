// Resolves ANTHROPIC_API_KEY without ever printing it.
// Order: process env -> Windows user environment (HKCU\Environment), which is
// where `setx` writes. A terminal opened before `setx` ran won't see the new
// value in process.env, so the registry read covers that case.
import { execFileSync } from "node:child_process";

const NAME = "ANTHROPIC_API_KEY";

function readWindowsUserEnv(name) {
  if (process.platform !== "win32") return "";
  try {
    const out = execFileSync("reg", ["query", "HKCU\\Environment", "/v", name], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    const line = out.split(/\r?\n/).find((l) => l.trim().startsWith(name));
    if (!line) return "";
    // Format: "    NAME    REG_SZ    value"
    const m = line.match(/REG_(?:EXPAND_)?SZ\s+(.*)$/);
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
}

export function resolveApiKey() {
  const fromEnv = (process.env[NAME] || "").trim();
  if (fromEnv) return { key: fromEnv, source: "process env" };
  const fromReg = readWindowsUserEnv(NAME);
  if (fromReg) return { key: fromReg, source: "Windows user env (HKCU)" };
  return { key: "", source: "none" };
}
