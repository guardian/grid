/**
 * Playwright global setup — runs once before all tests.
 *
 * 1. Checks if local ES (port 9220) is reachable
 * 2. If not, auto-starts it via `docker compose up -d` and waits
 * 3. Verifies the `images` index exists with data
 * 4. Safety gate: detects if the Vite dev server is proxying to a
 *    real (non-local) ES cluster and REFUSES to run tests. This
 *    prevents accidental test runs against TEST/CODE/PROD when the
 *    developer has `start.sh --use-TEST` still running.
 *
 * This makes local test runs resilient to the common workflow:
 *   ./scripts/start.sh --use-TEST  →  run smoke tests  →  stop app  →  run local tests
 * The --use-TEST startup shuts down Docker ES, so local tests would fail
 * without this auto-recovery.
 */

import { execSync } from "child_process";
import { resolve } from "path";

const ES_URL = "http://localhost:9220";
const VITE_URL = "http://localhost:3000";
const KUPUA_DIR = resolve(import.meta.dirname, "..");

/**
 * Maximum doc count that's considered "local data". Our sample dataset is
 * 10k docs. Any real cluster (TEST/CODE/PROD) has 100k+. 50k gives
 * generous headroom if someone loads a larger local sample.
 */
const LOCAL_MAX_DOCS = 50_000;

async function isEsReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${ES_URL}/_cluster/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Safety gate: if a Vite dev server is already running on port 3000,
 * check whether it's proxying to local ES or a real cluster.
 * Returns true if safe to proceed, throws if connected to a real cluster.
 */
async function checkViteNotConnectedToRealES(): Promise<void> {
  try {
    // Try the default local index name first, then a bare _count as fallback.
    // When connected to TEST, the index may be an alias like "images_current",
    // but /es/images/_count still works if the alias resolves.
    let count: number | undefined;
    for (const path of ["/es/images/_count", "/es/_count"]) {
      try {
        const res = await fetch(`${VITE_URL}${path}`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) continue;
        const data = (await res.json()) as { count?: number };
        if (data.count !== undefined) { count = data.count; break; }
      } catch { continue; }
    }
    if (count !== undefined && count > LOCAL_MAX_DOCS) {
      throw new Error(
        `\n\n` +
        `═══════════════════════════════════════════════════════════════\n` +
        `  🛑 REFUSING TO RUN E2E TESTS — REAL ES DETECTED\n` +
        `\n` +
        `  The Vite dev server on port 3000 is proxying to an ES cluster\n` +
        `  with ${count.toLocaleString()} documents. Local sample data has ~10k.\n` +
        `\n` +
        `  You probably have 'start.sh --use-TEST' still running.\n` +
        `  Stop it first, then re-run the tests:\n` +
        `\n` +
        `    1. Kill the --use-TEST dev server (Ctrl+C or kill the terminal)\n` +
        `    2. npx playwright test\n` +
        `\n` +
        `  The test runner will auto-start local Docker ES + a fresh Vite.\n` +
        `═══════════════════════════════════════════════════════════════\n`,
      );
    }
  } catch (e) {
    // Re-throw our own safety error
    if (e instanceof Error && e.message.includes("REFUSING")) throw e;
    // Any other error (Vite not running, timeout, etc.) — safe to proceed
  }
}

async function globalSetup() {
  // 0. Safety gate — refuse to run if a live Vite server is connected to
  //    a real ES cluster (TEST/CODE/PROD). Must run BEFORE anything else.
  await checkViteNotConnectedToRealES();

  // 1. Quick check — is ES already running?
  if (await isEsReachable()) {
    await verifyIndex();
    return;
  }

  // 2. ES not reachable — try to auto-start via docker compose
  console.log("  ⚡ Local ES not reachable — starting Docker container...");

  try {
    execSync("docker compose up -d", {
      cwd: KUPUA_DIR,
      stdio: "pipe",
      timeout: 30_000,
    });
  } catch (e) {
    throw new Error(
      `\n\n` +
      `═══════════════════════════════════════════════════════════════\n` +
      `  Failed to start Docker ES via 'docker compose up -d'.\n` +
      `\n` +
      `  Is Docker running? Try manually:\n` +
      `    cd kupua && docker compose up -d\n` +
      `═══════════════════════════════════════════════════════════════\n`,
    );
  }

  // 3. Wait for ES to become healthy (up to 30s)
  const MAX_WAIT = 30;
  let ready = false;
  for (let i = 0; i < MAX_WAIT; i++) {
    if (await isEsReachable()) {
      ready = true;
      break;
    }
    if (i === 0) {
      process.stdout.write("  ⏳ Waiting for ES to start");
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) {
    process.stdout.write("\n");
    throw new Error(
      `\n\n` +
      `═══════════════════════════════════════════════════════════════\n` +
      `  Docker container started but ES not reachable after ${MAX_WAIT}s.\n` +
      `\n` +
      `  Check: docker logs kupua-elasticsearch\n` +
      `═══════════════════════════════════════════════════════════════\n`,
    );
  }
  process.stdout.write(" ✓\n");

  // 4. Verify index + data
  await verifyIndex();
}

async function verifyIndex() {
  // After a cold start, ES may respond to _cluster/health before indices
  // are fully loaded from the data volume. Retry a few times.
  const MAX_INDEX_RETRIES = 10;

  for (let attempt = 0; attempt < MAX_INDEX_RETRIES; attempt++) {
    try {
      const countRes = await fetch(`${ES_URL}/images/_count`);
      if (!countRes.ok) {
        // Index not ready yet (404 or 503) — retry
        if (attempt < MAX_INDEX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw new Error(`Index check returned ${countRes.status}`);
      }
      const countData = (await countRes.json()) as { count: number };
      if (countData.count === 0) {
        throw new Error(
          `\n\n` +
          `═══════════════════════════════════════════════════════════════\n` +
          `  ES is running but the 'images' index is empty.\n` +
          `\n` +
          `  Load sample data:\n` +
          `    ./kupua/scripts/load-sample-data.sh\n` +
          `═══════════════════════════════════════════════════════════════\n`,
        );
      }
      console.log(`  ✓ ES ready: ${countData.count} documents in 'images' index`);
      return;
    } catch (e) {
      if (e instanceof Error && e.message.includes("index is empty")) throw e;
      if (e instanceof Error && e.message.includes("═══")) throw e;
      // Network error or non-200 — retry
      if (attempt < MAX_INDEX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw new Error(
        `\n\n` +
        `═══════════════════════════════════════════════════════════════\n` +
        `  ES is running but the 'images' index doesn't exist.\n` +
        `\n` +
        `  Load sample data:\n` +
        `    ./kupua/scripts/load-sample-data.sh\n` +
        `═══════════════════════════════════════════════════════════════\n`,
      );
    }
  }
}

export default globalSetup;

