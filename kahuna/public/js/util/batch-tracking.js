import PQueue from "p-queue";

const concurrency = 30;


export const trackAll = async ($rootScope, key, input, fns, emit) => {
  const withQueues = (Array.isArray(fns) ? fns : [fns]).map((fn) => {
    const queue = new PQueue({ concurrency });
    console.log(fn, queue);
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
      console.log("COMPLETING", {
        key,
        completed
      });
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

  $rootScope.$emit(emit, successes);
  return successes;
};
