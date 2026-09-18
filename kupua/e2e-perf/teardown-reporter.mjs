const STAGES = new Map([
  ["hook:After Hooks", "Cleanup"],
  ["test.step:Stop perf probes", "Stopping probes"],
  ['fixture:Fixture "perfEnvironment"', "Capturing environment"],
  ['fixture:Fixture "context"', "Closing browser context"],
]);

export default class TeardownReporter {
  constructor({ write = (line) => console.log(line) } = {}) {
    this.write = write;
    this.pending = new WeakMap();
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