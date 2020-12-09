// TODO MRB: invoke function lazily, does it improve UI jank?
export function trackAll($rootScope, key, input, fn) {
    let completed = 0;
    $rootScope.$broadcast("events:batch-operations:start",
      { key, completed: 0, total: input.size ? input.size : input.length });

  const loop = async (tasks) => {

    if (tasks.length === 0) {
      return;
    }

    const head = tasks.slice(0, 30);;
    const tail = tasks.slice(30);

    await Promise.all(head.map(async (task) => {
      await fn(task);
      completed++;
      $rootScope.$broadcast("events:batch-operations:progress", { key, completed });
    }));

    return loop(tail);
  };

    return loop(input).finally(() => {
        $rootScope.$broadcast("events:batch-operations:complete", { key });
    });
}

