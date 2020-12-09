import angular from "angular";
import { createQueue } from "./queue";

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

async.service("queue", ['$timeout', ($timeout) => {
  console.log("queue created!");
  return createQueue({
    timeout: $timeout,
    maxWorkers: 8
  });
}]);

async.factory("apiPoll", [
  "$q",
  "queue",
  ($q, queue) => {
    return func => {
      let {promise, resolve, reject} = $q.defer();
      queue.add({ resolve, reject, func });
      return promise;
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
