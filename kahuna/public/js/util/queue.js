/**
 * Creates a queue designed to limit the number of concurrent asynchronous operations,
 *
 * Calling `createQueue` returns an object that exposes an `add` function.
 *
 * Enqueued functions are called concurrently up to the worker limit, and retried with an
 * exponential backoff.
 *
 * @param {object} options
 * @param {number} options.jitterFactor The jitter factor in ms. Multiplied by 0-1 to jitter outgoing requests
 * @param {number} options.backoffBase The initial backoff factor to apply to retries
 * @param {number} options.initialBackoffWait The initial backoff wait to apply to retries
 * @param {number} options.maxWorkers The maximum number of concurrent operations to allow
 * @param {number} options.maxRetries The maximum number of retries for a single item in the queue before failure
 * @param {number} options.timeout The implementation of the timeout function to use. Defaults to window.setTimeout
 * @returns {{ add: Function }} See `add` below for the function signature.
 */
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

  /**
   * Add an item to the queue.
   *
   * @param {object} options
   * @param {(result: T) => void} options.resolve The resolve function to call if func completes
   * @param {(error: Error) => void} options.reject The reject function to call if func fails
   * @param {() => Promise<T>} options.func The function to enqueue
   * @param {number} retries
   */
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
