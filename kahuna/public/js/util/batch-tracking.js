import PQueue from "p-queue";

import { idleTimeout } from "./idleTimeout";

const concurrency = 30;

/** @typedef {*} Item thing you want to run the task on */

/**
 * @typedef Task
 * @param {Item} item that you're running the task on
 * @param {(* | undefined)} result from the previous function in the array, or undefined if at start
 */

/**
 * For running a series of tasks against a series of things and then notifying when it's done.
 * @param {*} $rootScope your angular root scope
 * @param {string} key name your operations
 * @param {*} input the things you want to run the tasks against
 * @param {(Task | Task[])} tasks that you want to run on the input, return awaitable.
 * @param {string| string[]} emit the name of the event you want emitted (with the results of the final function in the chain in an array)
 */
export const trackAll = async ($q, $rootScope, key, input, tasks, emit) => {
  const withQueues = (Array.isArray(tasks) ? tasks : [tasks]).map((fn) => {
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
  const emitNames = Array.isArray(emit) ? emit : [emit];
  emitNames.map(name => $rootScope.$emit(name, successes));
  idleTimeout(() => { $rootScope.$apply(); });
  return $q.resolve(successes);
};
