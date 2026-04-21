import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Lock tests to the production timezone. Without this, date-key bugs that
// only manifest in positive-offset zones (like task 46, where Thursday
// bookings rendered under the Friday column in Europe/Brussels) would pass
// on CI runners that default to UTC. Node reads `process.env.TZ` lazily,
// so setting it here before any Date construction is sufficient.
process.env.TZ = "Europe/Brussels";

// Load .env.local for integration tests that need database credentials
const envPath = resolve(__dirname, ".env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.local may not exist in CI — that's fine if env vars are set externally
}
