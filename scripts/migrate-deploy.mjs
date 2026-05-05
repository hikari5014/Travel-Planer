// Wrapper around `prisma migrate deploy` with retry + DB warmup.
// Neon free tier has cold-start latency that frequently trips Prisma's
// 10s advisory-lock timeout (P1002). Pre-warm the connection and retry
// up to 4 times with backoff before giving up.

import { execSync, spawnSync } from "node:child_process";

const MAX_ATTEMPTS = 4;
const BACKOFF_SEC = [0, 5, 10, 20]; // wait before each attempt

function warmup() {
  // Best-effort ping. If it fails, we still try migrate deploy below.
  try {
    spawnSync(
      "npx",
      ["prisma", "db", "execute", "--stdin"],
      { input: "SELECT 1;", encoding: "utf8", timeout: 15_000 },
    );
  } catch {
    // ignore
  }
}

for (let i = 0; i < MAX_ATTEMPTS; i++) {
  if (BACKOFF_SEC[i] > 0) {
    console.log(`[migrate-deploy] sleeping ${BACKOFF_SEC[i]}s before retry ${i + 1}/${MAX_ATTEMPTS}`);
    execSync(`sleep ${BACKOFF_SEC[i]}`);
  }
  if (i === 0) {
    console.log("[migrate-deploy] warming up Neon connection...");
    warmup();
  }
  console.log(`[migrate-deploy] attempt ${i + 1}/${MAX_ATTEMPTS}`);
  const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
  });
  if (r.status === 0) {
    console.log("[migrate-deploy] success");
    process.exit(0);
  }
  console.warn(`[migrate-deploy] attempt ${i + 1} failed (exit ${r.status})`);
}

console.error("[migrate-deploy] all attempts failed");
process.exit(1);
