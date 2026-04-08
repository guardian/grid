#!/usr/bin/env node

/**
 * Interactive runner for manual smoke tests against real ES.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  READ-ONLY smoke tests against real ES (TEST cluster).             ║
 * ║  May be run by human developers or by the agent when TEST is up.  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   node scripts/run-smoke.mjs           # interactive picker
 *   node scripts/run-smoke.mjs 2         # run test S2 directly
 *   node scripts/run-smoke.mjs 2,3,5     # run tests S2, S3, S5
 *   node scripts/run-smoke.mjs all       # run all smoke tests
 *
 * Prerequisites:
 *   Terminal 1: ./scripts/start.sh --use-TEST
 *   Terminal 2: node scripts/run-smoke.mjs
 */

import { execSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Corpus pinning — freeze the result set so totals don't drift between runs.
// TEST receives new images every ~20 minutes. Without pinning, seek accuracy
// assertions that compare bufferOffset to total will flicker.
// This uses the same env var as perf tests (PERF_STABLE_UNTIL) so the
// existing kupua.goto() helper picks it up automatically.
// ---------------------------------------------------------------------------

const SMOKE_STABLE_UNTIL = "2026-02-15T23:59:59.999Z";
if (!process.env["PERF_STABLE_UNTIL"]) {
  process.env["PERF_STABLE_UNTIL"] = SMOKE_STABLE_UNTIL;
}

const SPEC_FILES = [
  resolve(ROOT, "e2e/smoke/manual-smoke-test.spec.ts"),
  resolve(ROOT, "e2e/smoke/smoke-scroll-stability.spec.ts"),
  // Perf smoke tests moved to e2e-perf/perf.spec.ts — use run-perf-smoke.mjs
];

// ---------------------------------------------------------------------------
// Parse test names from the spec files
// ---------------------------------------------------------------------------

function listTests() {
  const tests = [];
  for (const specFile of SPEC_FILES) {
    let src;
    try { src = readFileSync(specFile, "utf-8"); } catch { continue; }
    // Match: test("S1: description", ... or test("P1: description", ...
    // Also matches S26a, S27b etc (letter suffix)
    const re = /test\(\s*"([SP]\d+[a-z]?:\s*[^"]+)"/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      tests.push(m[1]);
    }
  }
  return tests;
}

// ---------------------------------------------------------------------------
// Prompt user
// ---------------------------------------------------------------------------

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const tests = listTests();

  if (tests.length === 0) {
    console.error("No smoke tests found in", SPEC_FILE);
    process.exit(1);
  }

  console.log();
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           Manual Smoke Tests — Real ES (TEST)              ║");
  console.log("║      Runs HEADED so you can see what's happening.          ║");
  console.log("║      Tests auto-skip if not connected to real ES.          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();

  for (let i = 0; i < tests.length; i++) {
    console.log(`  ${i + 1}. ${tests[i]}`);
  }
  console.log();

  // Check for CLI argument (non-interactive mode)
  let selection = process.argv[2];

  if (!selection) {
    selection = await prompt(
      "Enter test number(s) to run (comma-separated), or 'all': "
    );
  }

  if (!selection) {
    console.log("No selection. Exiting.");
    process.exit(0);
  }

  // Build grep pattern
  let grepPattern;
  if (selection.toLowerCase() === "all") {
    grepPattern = "Smoke —";
  } else if (selection.toLowerCase() === "perf") {
    console.log('  ℹ️  Perf smoke tests moved to e2e-perf/. Use: node scripts/run-perf-smoke.mjs');
    process.exit(0);
  } else if (selection.toLowerCase() === "smoke") {
    grepPattern = "Smoke —";
  } else {
    // Support multiple input formats:
    //   "28"    → menu index 28 (1-based)
    //   "27a"   → S-number S27a (direct grep)
    //   "S27a"  → S-number S27a (direct grep)
    //   "27"    → could be menu index OR S-number; prefer S-number if it
    //             matches a test name, otherwise fall back to menu index
    const tokens = selection.split(",").map((s) => s.trim());
    const patterns = [];

    for (const tok of tokens) {
      // Check if token looks like an S/P-number (with optional letter suffix)
      const sMatch = tok.match(/^[SP]?(\d+[a-z]?)$/i);
      if (sMatch) {
        const sNum = sMatch[1]; // e.g. "27a" or "27"
        const prefix = tok.match(/^[SP]/i) ? tok[0].toUpperCase() : "S";
        const candidate = `${prefix}${sNum}`;

        // Check if this S-number matches any test name
        const directMatch = tests.some((t) =>
          t.match(new RegExp(`^${candidate}[:\\s]`, "i"))
        );

        if (directMatch) {
          patterns.push(candidate);
          continue;
        }

        // If no direct match AND token is purely numeric (no letter suffix),
        // try as a 1-based menu index
        if (/^\d+$/.test(tok)) {
          const idx = parseInt(tok, 10) - 1;
          if (idx >= 0 && idx < tests.length) {
            const nameMatch = tests[idx].match(/^([SP]\d+[a-z]?)/);
            patterns.push(nameMatch ? nameMatch[1] : tests[idx]);
            continue;
          }
        }
      }

      console.error(`Invalid token: "${tok}". Use S-numbers (e.g. 27a, S27a) or menu indices (1-${tests.length}).`);
      process.exit(1);
    }

    grepPattern = patterns.join("|");
  }

  console.log();
  console.log(`Running: ${grepPattern}`);
  console.log("─".repeat(60));
  console.log();

  // Run Playwright — uses the smoke-specific config (headed, no globalSetup,
  // longer timeouts, no testIgnore). Output goes to terminal via stdio: inherit.
  const result = spawnSync(
    "npx",
    [
      "playwright", "test",
      "--config=playwright.smoke.config.ts",
      "--reporter=list",
      `--grep=${grepPattern}`,
    ],
    {
      cwd: ROOT,
      stdio: "inherit",
    },
  );

  process.exit(result.status ?? 1);
}

main();


