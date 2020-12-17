import PQueue from "p-queue";

const concurrency = 30;

// TODO MRB: invoke function lazily, does it improve UI jank?
export function trackAll($rootScope, key, input, [fns], emit) {
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
      console.log([item, result]);
      return [item, result];
    }

    return process(item,  await fn(item, result), remaining);
  };

  const results = input.map((item) => process(item, undefined, withQueues));

  return Promise.all(results)
    .then(result => {
      if (emit) {
        result.map(([old, neu]) => {
          $rootScope.$emit(emit, neu, old);
        });
      }
    }).finally(() => {
    $rootScope.$broadcast("events:batch-operations:complete", { key });
  });
}
