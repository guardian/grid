import PQueue from "p-queue";

const concurrency = 30;

const wait = (t) => new Promise(resolve => {
  setTimeout(resolve, t);
});

const chunkSize = 100;
const chunkWait = 4000;

const chunkAndWait = async (f, l) => {
  const head = l.slice(0, chunkSize);
  const tail = l.slice(chunkSize);
  await f(head);
  if (tail.length === 0) {
    return;
  }
  await wait(chunkWait);
  return chunkAndWait(f, tail);
};

// TODO MRB: invoke function lazily, does it improve UI jank?
export const trackAll = async ($rootScope, key, input, fns, emit) => {
  const withQueues = (Array.isArray(fns) ? fns : [fns]).map((fn) => {
    const queue = new PQueue({ concurrency });
    return (item, result) => queue.add(() => fn(item, result));
  });

  let completed = 0;
  $rootScope.$broadcast("events:batch-operations:start", {
    key,
    completed,
    total: input.size ? input.size : input.length
  });

  const process = async (item, result, [fn, ...remaining]) => {
    if (fn == undefined) {
      completed++;
      $rootScope.$broadcast("events:batch-operations:progress", {
        key,
        completed
      });
      //TODO ^ Batch per fn
      return result;
    }

    return process(item, await fn(item, result), remaining);
  };

  const resultsPromises = input.map((item) => process(item, undefined, withQueues));

  const results = await Promise.allSettled(resultsPromises);
  const successes = results.filter(({ status }) => status === 'fulfilled').map(({ value }) => value);

  results.forEach(({ status, reason }, i) => {
    if (status === 'rejected') {
      console.error("Error in batch ", input[i], reason);
    }
  });

  $rootScope.$broadcast("events:batch-operations:complete", { key });

  completed = 0;

  $rootScope.$broadcast("events:batch-operations:start", { key: "Reticulating Splines.",total: successes.length, completed});

  await chunkAndWait((l) => {
    $rootScope.$emit(emit, l);
    completed += l.length;
    $rootScope.$broadcast("events:batch-operations:progress", { key: "Reticulating Splines.", completed});
  }, successes);

  $rootScope.$broadcast("events:batch-operations:complete", { key: "Reticulating Splines." });

  return successes;
};
