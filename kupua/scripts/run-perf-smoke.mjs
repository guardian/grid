#!/usr/bin/env node

/**
 * Run rendering performance smoke tests and stream output.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  MANUAL INVOCATION ONLY — NEVER RUN BY CI, SCRIPTS, OR AGENTS.    ║
 * ║  Only a human developer should run this from their IDE terminal.   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   node scripts/run-perf-smoke.mjs           # run all P* tests
 *   node scripts/run-perf-smoke.mjs P1         # run just P1
 *   node scripts/run-perf-smoke.mjs P2,P7      # run P2 and P7
 *   node scripts/run-perf-smoke.mjs P10        # the full workflow composite
 *
 * Viewport: hardcoded to 3840x2160 @1x DPR (4K) in playwright.smoke.config.ts.
 *
 * Prerequisites:
 *   Terminal 1: ./scripts/start.sh --use-TEST
 *   Terminal 2: node scripts/run-perf-smoke.mjs
 *
 * Output streams directly to stdout (no sub-process indirection) so
 * IDE terminal capture and agent tools can read it.
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Build grep pattern from CLI args
// ---------------------------------------------------------------------------

const arg = process.argv[2]?.trim();
let grepPattern;

if (!arg) {
  grepPattern = "Rendering Performance Smoke";
} else if (arg.toLowerCase() === "all") {
  grepPattern = "Rendering Performance Smoke";
} else {
  const parts = arg.split(",").map((s) => s.trim());
  grepPattern = parts.join("|");
}

console.log();
console.log("+" + "=".repeat(62) + "+");
console.log("|       Rendering Performance Smoke Tests -- Real ES          |");
console.log("|   Runs HEADED at 1987x1110 @1.25x (MacBook Pro Retina)      |");
console.log("|   Output streams to this terminal for agent analysis.       |");
console.log("+" + "=".repeat(62) + "+");
console.log();
console.log(`  Grep: ${grepPattern}`);
console.log();

// Spawn Playwright with stdio piped to this process's stdout/stderr.
// Using spawn (not spawnSync) with pipe so Node's event loop stays active
// and output flows to the IDE terminal in real time.
const child = spawn(
  "npx",
  [
    "playwright", "test",
    "--config=playwright.smoke.config.ts",
    "--reporter=list",
    `--grep=${grepPattern}`,
  ],
  {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0" },
  },
);

// Stream child stdout/stderr to this process's stdout/stderr
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

child.on("close", (code) => {
  console.log();
  console.log(`---- Playwright exited with code ${code} ----`);
  process.exit(code ?? 1);
});
