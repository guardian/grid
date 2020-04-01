export const createQueue = ({
  jitterFactor = 100,
  backoffBase = 2,
  initialBackoffWait = 500,
  maxWorkers = 5,
  maxRetries = 30,
  timeout = setTimeout
} = {}) => {
  const getBackoffTimeFromRetries = noOfRetries => {
    const jitter = Math.floor(Math.random() * jitterFactor);
    const wait = initialBackoffWait * backoffBase ** noOfRetries + jitter;
    return wait;
  };

  let queue = [];
  let running = false;
  const add = ({ resolve, reject, func, retries = 0 }) => {
    queue.push({ resolve, reject, func, retries });
    if (!running) {
      run();
    }
  };

  const startWorker = () => {
    running = true;
    if (queue.length === 0) {
      running = false;
      return;
    }
    const { resolve, reject, func, retries } = queue.shift();
    func()
      .then(resolved => {
        resolve(resolved);
      })
      .catch(e => {
        if (retries >= maxRetries) {
          reject(e);
        }
        timeout(() => {
          add({ resolve, reject, func, retries: retries + 1 });
        }, getBackoffTimeFromRetries(retries));
      })
      .finally(() => {
        // This adds the subsequent run call to the next tick,
        // ensuring it is run in a new call stack.
        timeout(() => startWorker(), 0);
      });
  };

  const run = () => {
    for (let i = 0; i < maxWorkers; i++) {
      timeout(startWorker(), 0);
    }
  };

  return { add };
};
