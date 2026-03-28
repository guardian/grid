/**
 * Playwright global setup — runs once before all tests.
 *
 * 1. Checks if local ES (port 9220) is reachable
 * 2. If not, auto-starts it via `docker compose up -d` and waits
 * 3. Verifies the `images` index exists with data
 *
 * This makes local test runs resilient to the common workflow:
 *   ./scripts/start.sh --use-TEST  →  run smoke tests  →  stop app  →  run local tests
 * The --use-TEST startup shuts down Docker ES, so local tests would fail
 * without this auto-recovery.
 */

import { execSync } from "child_process";
import { resolve } from "path";

const ES_URL = "http://localhost:9220";
const KUPUA_DIR = resolve(import.meta.dirname, "..");

async function isEsReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${ES_URL}/_cluster/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function globalSetup() {
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

