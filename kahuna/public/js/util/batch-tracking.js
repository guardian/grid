import throat from "throat";

const limiter = throat(30);

// TODO MRB: invoke function lazily, does it improve UI jank?
export function trackAll($rootScope, key, input, fn) {
  let completed = 0;
  $rootScope.$broadcast("events:batch-operations:start",
    {key, completed: 0, total: input.size ? input.size : input.length});

  const promises = input.map(item => limiter(() =>
      fn(item).then(result => {
        completed++;
        $rootScope.$broadcast("events:batch-operations:progress", {key, completed});
        return result;
      })
    )
  );

  return Promise.allSettled(promises).then((results) => {

    const withItems = results.map((result,i)=>({
      item: input[i],
      ...result
    }));

    const failures = withItems.filter(_=>_.status === "rejected");

    failures.map(console.error);

    $rootScope.$broadcast("events:batch-operations:complete", {key});
  });
}
