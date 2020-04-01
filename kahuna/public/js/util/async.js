import angular from "angular";

export var async = angular.module("util.async", []);

/**
 * Return a lazy function that will yield before calling the input `func`.
 */
async.factory("nextTick", [
  "$timeout",
  function($timeout) {
    function nextTick(func) {
      return () => $timeout(func, 0);
    }

    return nextTick;
  }
]);

/**
 * Return a Promise that is resolved with no value after `duration`.
 */
async.factory("delay", [
  "$q",
  "$timeout",
  function($q, $timeout) {
    function delay(duration) {
      var defer = $q.defer();
      $timeout(defer.resolve, duration);
      return defer.promise;
    }

    return delay;
  }
]);

async.factory("race", [
  "$q",
  function($q) {
    function race(promises) {
      var first = $q.defer();
      promises.forEach(promise => {
        promise.then(first.resolve, first.reject);
      });
      return first.promise;
    }

    return race;
  }
]);

async.service("queue", [
  () => {
    const JITTER = 100;
    const BACKOFF_BASE = 2;
    const INITIAL_BACKOFF_WAIT = 500;
    const MAX_WORKERS = 5;

    const getBackoffTimeFromRetries = noOfRetries => {
      const jitter = Math.floor(Math.random() * JITTER);
      const wait = INITIAL_BACKOFF_WAIT * BACKOFF_BASE ** noOfRetries + jitter;
      return wait;
    };

    let queue = [];
    let running = false;
    console.log("instantiating queue");
    const add = ({ promise, func, backoff = 0 }) => {
      console.log("adding to queue", func);
      queue.push({ promise, func, backoff });
      console.log(queue.length, JSON.stringify(queue));
      if (!running) {
        run();
      }
    };

    let thingsDone = 0;
    const startWorker = () => {
      running = true;
      if (queue.length === 0) {
        console.log("We did ", thingsDone, "things");
        thingsDone = 0;
        running = false;
        return;
      }
      thingsDone++;
      const { resolve, reject, func, retries } = queue.shift();
      console.log(`Shifted task off queue, queue now ${queue.length} long`);
      func()
        .then(resolved => {
          resolve(resolved);
        })
        .catch(() => {
          console.log("poll failed");

          setTimeout(() => {
            add({ resolve, reject, func, retries: retries + 1 });
          }, getBackoffTimeFromRetries(retries));
        })
        .finally(() => {
          console.log("task complete");
          // This adds the subsequent run call to the next tick,
          // ensuring it is run in a new call stack.
          setTimeout(() => startWorker(), 0);
        });
    };

    const run = () => {
      for (let i = 0; i < MAX_WORKERS; i++) {
        setTimeout(startWorker(), 0);
      }
    };

    return { add };
  }
]);

async.factory("apiPoll", [
  "$q",
  "queue",
  ($q, queue) => {
    console.log("instantiating pollQ with ", queue);
    return func => {
      let deferred = $q.defer();
      console.log("adding in pollQ", func);
      queue.add({ promise: deferred, func });
      return deferred.promise;
    };
  }
]);

// Return a promise resolved the next time the event is fired on the scope
async.factory("onNextEvent", [
  "$q",
  function($q) {
    function onNextEvent(scope, event) {
      const defer = $q.defer();
      const unregister = scope.$on(event, (_, arg) => defer.resolve(arg));
      return defer.promise.finally(unregister);
    }

    return onNextEvent;
  }
]);
