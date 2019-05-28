// TODO MRB: invoke function lazily, does it improve UI jank?
export function trackAll($rootScope, key, input, fn) {
    let completed = 0;
    $rootScope.$broadcast("events:batch-operations:start", { key, completed: 0, total: input.size ? input.size : input.length });

    return Promise.all(input.map(item => fn(item).then(intermediateResult => {
        completed++;
        $rootScope.$broadcast("events:batch-operations:progress", { key, completed });

        return intermediateResult;
    }))).then(finalResult => {
        $rootScope.$broadcast("events:batch-operations:complete", { key });
        return finalResult;
    }).catch(error => {
        $rootScope.$broadcast("events:batch-operations:complete", { key });
        throw error;
    });
}