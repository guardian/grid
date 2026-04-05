#!/usr/bin/env node

/**
 * Interactive runner for manual smoke tests against real ES.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  MANUAL INVOCATION ONLY — NEVER RUN BY CI, SCRIPTS, OR AGENTS.    ║
 * ║  Only a human developer should run this from their IDE terminal.   ║
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
const SPEC_FILES = [
  resolve(ROOT, "e2e/manual-smoke-test.spec.ts"),
  resolve(ROOT, "e2e/smoke-scroll-stability.spec.ts"),
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
    const re = /test\(\s*"([SP]\d+:\s*[^"]+)"/g;
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
    grepPattern = "Smoke — real ES";
  } else if (selection.toLowerCase() === "perf") {
    console.log('  ℹ️  Perf smoke tests moved to e2e-perf/. Use: node scripts/run-perf-smoke.mjs');
    process.exit(0);
  } else if (selection.toLowerCase() === "smoke") {
    grepPattern = "Smoke — real ES";
  } else {
    const indices = selection.split(",").map((s) => parseInt(s.trim(), 10) - 1);
    const invalid = indices.filter((i) => isNaN(i) || i < 0 || i >= tests.length);
    if (invalid.length > 0) {
      console.error(`Invalid selection. Pick numbers 1-${tests.length}.`);
      process.exit(1);
    }
    // Extract the S/P-number from each test name for grep
    const patterns = indices.map((i) => {
      const match = tests[i].match(/^([SP]\d+)/);
      return match ? match[1] : tests[i];
    });
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


