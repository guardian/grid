export const queue = ({
  JITTER = 100,
  BACKOFF_BASE = 2,
  INITIAL_BACKOFF_WAIT = 500,
  MAX_WORKERS = 5,
  MAX_RETRIES = 30 } = {}) => {


  const getBackoffTimeFromRetries = noOfRetries => {
    const jitter = Math.floor(Math.random() * JITTER);
    const wait = INITIAL_BACKOFF_WAIT * BACKOFF_BASE ** noOfRetries + jitter;
    return wait;
  };

  let queue = [];
  let running = false;
  console.log("instantiating queue");
  const add = ({ resolve, reject, func, retries = 0 }) => {
    console.log("adding to queue", func);
    queue.push({ resolve, reject, func, retries });
    console.log(queue.length, JSON.stringify(queue));
    if (!running) {
      run();
    }
  };

  let thingsDone = 0;
  const startWorker = () => {
    running = true;
    if (queue.length === 0) {
      console.log("We did ", thingsDone, "things");
      thingsDone = 0;
      running = false;
      return;
    }
    thingsDone++;
    const { resolve, reject, func, retries } = queue.shift();
    console.log(`Shifted task off queue, queue now ${queue.length} long`);
    func()
      .then(resolved => {
        resolve(resolved);
      })
      .catch((e) => {
        console.log("poll failed");
        if (retries >= MAX_RETRIES) {
          console.error("MAX RETRIES EXCEEDED");
          reject(e);
        }
        setTimeout(() => {
          add({ resolve, reject, func, retries: retries + 1 });
        }, getBackoffTimeFromRetries(retries));
      })
      .finally(() => {
        console.log("task complete");
        // This adds the subsequent run call to the next tick,
        // ensuring it is run in a new call stack.
        setTimeout(() => startWorker(), 0);
      });
  };

  const run = () => {
    for (let i = 0; i < MAX_WORKERS; i++) {
      setTimeout(startWorker(), 0);
    }
  };

  return { add };
};
