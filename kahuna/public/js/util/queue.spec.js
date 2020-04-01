import { queue } from "./queue";

const addToQueue = (q, func) => new Promise((resolve, reject) => {
  console.log("EHHELLO");
  q.add({ resolve, reject, func });
});

describe('queue', async () => {
  it("should not retry too many times", async () => {
    const MAX_RETRIES = 5;
    const q = queue({
      MAX_RETRIES,
      INITIAL_BACKOFF_WAIT: 1
    });
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new Error("Never going to work.");
    };
    await expect(addToQueue(q, fn)).rejects.toStrictEqual(new Error("Never going to work."));
    expect(attempts).toBe(MAX_RETRIES + 1);
  });

  it("should return a promise, which resolves", async () => {
    const success = "YES";
    const q = queue();
    const fn = async () => success;
    await expect(addToQueue(q, fn)).resolves.toBe(success);
  });

});
