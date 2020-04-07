import { createQueue } from "./queue";

const addToQueue = (q, func) => new Promise((resolve, reject) => {
  q.add({ resolve, reject, func });
});

const runner = (timeout, value, executionsBuffer) => () => new Promise((resolve) => {
  setTimeout(() => {
    executionsBuffer.push(value);
    resolve(executionsBuffer);
  }, timeout);
});

describe('queue', () => {
  it("should not retry too many times", async () => {
    const maxRetries = 5;
    const q = createQueue({
      maxRetries,
      initialBackoffWait: 1
    });
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new Error("Never going to work.");
    };
    await expect(addToQueue(q, fn)).rejects.toStrictEqual(new Error("Never going to work."));
    expect(attempts).toBe(maxRetries + 1);
  });

  it("should return a promise, which resolves", async () => {
    const success = "YES";
    const q = createQueue();
    const fn = async () => success;

    await expect(addToQueue(q, fn)).resolves.toBe(success);
  });

  it("should run functions one after the other with one worker", async () => {
    const q = createQueue({ maxWorkers: 1 });
    let executions = [];
    const a = addToQueue(q, runner(1000, 1, executions));
    const b = addToQueue(q, runner(0, 2, executions));
    await Promise.all([a, b]);

    expect(executions).toEqual([1, 2]);
  });

  it("should run functions simultaneously with multiple workers", async () => {
    const q = createQueue({ maxWorkers: 2 });
    let executions = [];
    const a = addToQueue(q, runner(1000, 1, executions));
    const b = addToQueue(q, runner(0, 2, executions));
    await Promise.all([a, b]);

    expect(executions).toEqual([2, 1]);
  });

  it("should begin additional functions as soon as pending functions are complete", async () => {
    const q = createQueue({ maxWorkers: 2 });
    let executions = [];
    const a = addToQueue(q, runner(1000, 1, executions));
    const b = addToQueue(q, runner(10, 2, executions));
    const c = addToQueue(q, runner(10, 3, executions));
    await Promise.all([a, b, c]);

    expect(executions).toEqual([2, 3, 1]);
  });
});
