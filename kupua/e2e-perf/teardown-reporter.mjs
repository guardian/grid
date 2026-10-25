import { AUTH_REQUIRED_MARKER, AUTH_RENEWAL_COMMAND } from "./auth-failure.mjs";

const STAGES = new Map([
  ["hook:After Hooks", "Cleanup"],
  ["test.step:Stop perf probes", "Stopping probes"],
  ['fixture:Fixture "perfEnvironment"', "Capturing environment"],
  ['fixture:Fixture "context"', "Closing browser context"],
]);

export default class TeardownReporter {
  constructor({ write = (line) => console.log(line), interrupt = () => process.kill(process.pid, "SIGINT") } = {}) {
    this.write = write;
    this.interrupt = interrupt;
    this.authStopped = false;
    this.authTail = "";
    this.pending = new WeakMap();
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