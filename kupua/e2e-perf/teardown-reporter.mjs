import { AUTH_REQUIRED_MARKER, AUTH_RENEWAL_COMMAND } from "./auth-failure.mjs";
import { writeFileSync } from "node:fs";
import { metricIdsForTest } from "./harness-validation.mjs";
import { DENSITY_SCENARIOS } from "./density-reporting.mjs";

const STAGES = new Map([
  ["hook:After Hooks", "Cleanup"],
  ["test.step:Stop perf probes", "Stopping probes"],
  ['fixture:Fixture "perfEnvironment"', "Capturing environment"],
  ['fixture:Fixture "context"', "Closing browser context"],
]);

export default class TeardownReporter {
  constructor({ write = (line) => console.log(line), interrupt = () => process.kill(process.pid, "SIGINT"),
    outputFile = process.env.KUPUA_PERF_OUTCOMES_FILE, token = process.env.KUPUA_PERF_CAPTURE_TOKEN,
    kind = process.env.KUPUA_PERF_KIND } = {}) {
    this.write = write;
    this.interrupt = interrupt;
    this.authStopped = false;
    this.authTail = "";
    this.pending = new WeakMap();
    this.outputFile = outputFile;
    this.token = token;
    this.kind = kind;
    this.tests = [];
  }

  onTestEnd(test, result) {
    const ids = this.kind === "density"
      ? DENSITY_SCENARIOS.filter(scenario => test.title.startsWith(`density ${scenario.workload}:`)).map(scenario => scenario.id)
      : metricIdsForTest(test.title, this.kind);
    const annotations = test.annotations ?? [];
    const failure = annotations.filter(annotation => annotation.type === "perf-failure").at(-1)?.description
      ?? ((result.errors ?? []).some(error => /Required search data unavailable|Perf environment endpoint returned HTTP/.test(error.message ?? "")) ? "setup-data-error" : undefined);
    const reasons = ["setup-data-error", "capture-invalid", "source-changed", "unexpected-reload", "performance-budget", "observation-boundary-late"];
    const reason = this.authStopped ? "authentication-required" : reasons.includes(failure) ? failure
      : result.status === "interrupted" ? "interrupted" : "completion-unavailable";
    const stage = ["setup-data-error", "authentication-required"].includes(reason) ? "setup"
      : ["source-changed", "unexpected-reload", "capture-invalid", "observation-boundary-late"].includes(reason) ? "validation"
      : reason === "performance-budget" ? "assessment" : "measurement";
    const activeId = annotations.filter(annotation => annotation.type === "perf-active").at(-1)?.description;
    let evidence;
    try {
      const raw = JSON.parse(annotations.find(annotation => annotation.type === "perf-data-evidence")?.description ?? "null");
      if (raw) {
        const number = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
        evidence = { responses: number(raw.responses), failedResponses: number(raw.failedResponses), unexpectedContentTypes: number(raw.unexpectedContentTypes),
          responseSamples: (Array.isArray(raw.responseSamples) ? raw.responseSamples : []).slice(0, 8)
            .map(sample => ({ status: number(sample.status), contentType: ["json", "html", "other"].includes(sample.contentType) ? sample.contentType : "other" })),
          transportFailures: Object.fromEntries(["aborted", "dns", "timeout", "connection", "certificate", "other"]
            .filter(key => number(raw.transportFailures?.[key]) !== null).map(key => [key, raw.transportFailures[key]])),
          readiness: raw.readiness ? Object.fromEntries(["storePresent", "loading", "hasError", "resultsPresent", "searchStarts", "correlatedReady"]
            .map(key => [key, typeof raw.readiness[key] === "boolean" ? raw.readiness[key] : number(raw.readiness[key])])) : null };
      }
    } catch {}
    if (reason === "observation-boundary-late") {
      try {
        const raw = JSON.parse(annotations.find(annotation => annotation.type === "perf-boundary-evidence")?.description ?? "null");
        const fields = ["observerStopLagMs", "recoveryStartLagMs"];
        if (fields.every(key => Number.isFinite(raw?.[key]) && raw[key] >= 0)) {
          evidence = { ...evidence, observationBoundary: Object.fromEntries(fields.map(key => [key, raw[key]])) };
        }
      } catch {}
    }
    if (ids.length) this.tests.push({ ids, status: result.status,
      ...(ids.includes(activeId) ? { activeId } : {}),
      ...(result.status !== "passed" ? { reason, stage, ...(evidence ? { evidence } : {}) } : {}) });
    if (["setup-data-error", "authentication-required", "capture-invalid", "source-changed", "unexpected-reload"].includes(reason) && !this.authStopped) {
      this.write(`Performance ${stage} failure (${reason}). Stopping dependent work; remaining measurements are not attempted.`);
      this.interrupt();
    }
  }

  onEnd() {
    if (this.outputFile) writeFileSync(this.outputFile, JSON.stringify({ revision: 1, token: this.token, tests: this.tests }) + "\n");
  }

  onStdOut(chunk) {
    if (this.authStopped) return;
    const text = this.authTail + chunk.toString();
    this.authTail = text.slice(-(AUTH_REQUIRED_MARKER.length - 1));
    if (!text.includes(AUTH_REQUIRED_MARKER)) return;
    this.authStopped = true;
    this.write("Authentication required. Stopping this campaign; renew auth and rerun from the beginning.");
    this.write("Replace the placeholder with your external cookie-file path, sign in, then close the codegen browser:");
    this.write(AUTH_RENEWAL_COMMAND);
    this.interrupt();
  }

  printsToStdio() {
    return true;
  }

  onStepBegin(test, _result, step) {
    const stage = STAGES.get(`${step.category}:${step.title}`);
    if (!stage) return;
    let ancestor = step;
    while (ancestor && !(ancestor.category === "hook" && ancestor.title === "After Hooks")) {
      ancestor = ancestor.parent;
    }
    if (!ancestor) return;

    const scenario = test.title.match(/^(?:P\d+[a-z]?|PP\d+[a-z]?|JA|JB)(?=:)/)?.[0] ?? "perf";
    const prefix = `[perf cleanup] ${scenario} | ${stage}`;
    this.pending.set(step, prefix);
    this.write(`${prefix}: started`);
  }

  onStepEnd(_test, _result, step) {
    const prefix = this.pending.get(step);
    if (!prefix) return;
    this.pending.delete(step);
    const outcome = step.error ? "failed" : "completed";
    this.write(`${prefix}: ${outcome} in ${Math.round(step.duration)}ms`);
  }
}