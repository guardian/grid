import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout = realpathSync(fileURLToPath(new URL("../../../../", import.meta.url)));
const usage = `Usage: node capture.mjs --package ANDROID_PACKAGE [--seconds 20] [--sources]
       [--profile renderer|frames] [--preflight] --check-config|--record
       node capture.mjs --self-test

No device access without --record. No automatic input, debugger or server changes.
Raw trace/stderr stay in a private temporary directory outside the checkout.
--sources retains private debug arguments for source attribution.
`;

function parseArgs(args) {
  const options = { profile: "renderer", seconds: 20, sources: false, preflight: false };
  const switches = { "--record": "record", "--check-config": "check", "--self-test": "selfTest",
    "--help": "help", "--sources": "sources", "--preflight": "preflight" };
  const values = { "--package": "package", "--seconds": "seconds", "--profile": "profile" };
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (switches[option]) options[switches[option]] = true;
    else if (values[option] && args[index + 1] && !args[index + 1].startsWith("--")) options[values[option]] = args[++index];
    else throw new Error("Unknown option or missing value; use --help");
  }
  if (options.help || args.length === 0) return { help: true };
  const actions = [options.record, options.check, options.selfTest].filter(Boolean).length;
  if (actions !== 1) throw new Error("Choose exactly one of --record, --check-config or --self-test");
  if (options.selfTest) return options;
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(options.package ?? "")) throw new Error("An explicit Android package is required");
  options.seconds = Number(options.seconds);
  if (!Number.isInteger(options.seconds) || options.seconds < 1 || options.seconds > 30) throw new Error("Duration must be 1..30 seconds");
  if (!["renderer", "frames"].includes(options.profile)) throw new Error("Unknown capture profile");
  if (options.sources && options.profile !== "renderer") throw new Error("--sources requires renderer mode");
  return options;
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`));
}

function makeConfig(options) {
  const renderer = options.profile === "renderer";
  const durationMs = options.preflight ? 1000 : options.seconds * 1000;
  const producer = `org[.]chromium-${options.package.replaceAll(".", "[.]")}-[0-9]+`;
  return `buffers { size_kb: ${renderer ? 8192 : 4096} fill_policy: RING_BUFFER }
${renderer ? `buffers { size_kb: 16384 fill_policy: RING_BUFFER }
buffers { size_kb: 32768 fill_policy: RING_BUFFER }` : ""}
data_sources { config { name: "android.surfaceflinger.frametimeline" } }
${renderer ? `data_sources { config {
  name: "linux.ftrace"
  target_buffer: 1
  ftrace_config {
    compact_sched { enabled: true }
    ftrace_events: "sched/sched_switch"
    ftrace_events: "sched/sched_waking"
    ftrace_events: "power/cpu_frequency"
  }
} }
data_sources { config {
  name: "linux.process_stats"
  process_stats_config { scan_all_processes_on_start: true }
} }
data_sources {
  producer_name_regex_filter: "${producer}"
  config {
    name: "track_event"
    target_buffer: 2
    chrome_config { privacy_filtering_enabled: true }
    track_event_config {
      disabled_categories: "*"
      enabled_categories: "toplevel"
      enabled_categories: "devtools.timeline"
      enabled_categories: "disabled-by-default-devtools.timeline"
      enabled_categories: "blink"
      enabled_categories: "cc"
      enabled_categories: "v8"
      enabled_categories: "input.scrolling"
      filter_debug_annotations: ${options.sources ? "false" : "true"}
      filter_dynamic_event_names: true
    }
  }
}` : ""}
duration_ms: ${durationMs}
`;
}

async function record(options) {
  const parent = realpathSync(tmpdir());
  if (isInside(checkout, parent)) throw new Error("Temporary storage must be outside the checkout");
  const directory = mkdtempSync(join(parent, "kupua-mobile-perf-"));
  chmodSync(directory, 0o700);
  const trace = join(directory, "capture.perfetto-trace");
  const stderr = join(directory, "capture.stderr");
  const seconds = options.preflight ? 1 : options.seconds;
  console.log(JSON.stringify({ recordingSeconds: seconds, operatorInputRequired: !options.preflight,
    automaticGestures: 0, privateArguments: options.sources, privateDirectory: directory }));
  let interrupted = false;
  let interrupt;
  const result = await new Promise(resolve => {
    const child = execFile("adb", ["shell", "-T", "perfetto", "--txt", "-c", "-", "-o", "-"], {
      encoding: "buffer", timeout: (seconds + 15) * 1000, maxBuffer: 128 * 1024 * 1024,
    }, (error, stdout, errors) => resolve({ error, stdout: stdout ?? Buffer.alloc(0), stderr: errors ?? Buffer.alloc(0) }));
    interrupt = () => { interrupted = true; child.kill("SIGTERM"); };
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    child.stdin.on("error", () => {});
    child.stdin.end(makeConfig(options));
  }).finally(() => {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  });
  writeFileSync(trace, result.stdout, { flag: "wx", mode: 0o600 });
  writeFileSync(stderr, result.stderr, { flag: "wx", mode: 0o600 });
  const captured = !result.error && !interrupted && result.stdout.length > 0;
  console.log(JSON.stringify({ captured, trace, stderr, bytes: result.stdout.length,
    interrupted, exitCode: typeof result.error?.code === "number" ? result.error.code : captured ? 0 : null,
    errorCode: typeof result.error?.code === "string" ? result.error.code : null,
    retained: true, integrityVerified: false }));
  if (!captured) process.exitCode = 1;
}

function selfTest() {
  const options = parseArgs(["--package", "com.example.browser", "--sources", "--check-config"]);
  const config = makeConfig(options);
  assert.ok(config.includes('org[.]chromium-com[.]example[.]browser-[0-9]+'));
  assert.ok(config.includes("filter_debug_annotations: false"));
  assert.ok(config.includes("target_buffer: 2"));
  assert.ok(config.includes("duration_ms: 20000"));
  assert.ok(makeConfig({ ...options, preflight: true }).includes("duration_ms: 1000"));
  assert.equal(makeConfig({ ...options, profile: "frames", sources: false }).includes('name: "track_event"'), false);
  assert.throws(() => parseArgs(["--package", "com.example.browser", "--seconds", "31", "--record"]));
  assert.throws(() => parseArgs(["--package", "com.example.browser", "--record", "--check-config"]));
  assert.throws(() => parseArgs(["--package", "invalid", "--record"]));
  assert.equal(isInside(checkout, join(checkout, "node_modules")), true);
  assert.equal(isInside(checkout, `${checkout}-other`), false);
  console.log(JSON.stringify({ selfTest: "passed", deviceAccess: false, filesWritten: false }));
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) console.log(usage);
  else if (options.selfTest) selfTest();
  else if (options.check) console.log(JSON.stringify({ deviceAccess: false, config: makeConfig(options) }, null, 2));
  else await record(options);
} catch (error) {
  console.error(JSON.stringify({ failed: true, stage: "configuration-or-capture",
    reason: error.code ?? (error instanceof assert.AssertionError ? "self-test-failed" : error.message) }));
  process.exitCode = 1;
}