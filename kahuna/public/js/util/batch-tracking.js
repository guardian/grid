import { createQueue } from "./queue";

// TODO MRB: invoke function lazily, does it improve UI jank?
export function trackAll($rootScope, key, input, fn) {
    let completed = 0;
    $rootScope.$broadcast("events:batch-operations:start",
        { key, completed: 0, total: input.size ? input.size : input.length });
  const queue = createQueue({ maxWorkers: 15 });
  const results = input.map(item => {
    return new Promise((resolve, reject) =>
      queue.add({
        func: () => fn(item).then(result => {
          completed++;
          $rootScope.$broadcast("events:batch-operations:progress", { key, completed });
          return result;
        }),
        reject,
        resolve
      })
    );
  });


    return Promise.all(results).finally(() => {
        $rootScope.$broadcast("events:batch-operations:complete", { key });
    });
}
