import angular from "angular";
import PQueue from "p-queue";

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


async.factory("apiPoll", [
  () => {
    const wait = () => new Promise(resolve => {
      console.log("WAIT");
      setTimeout(() => resolve(), 4000);
    });
    const queue = new PQueue({ concurrency: 10 });
    const poll = async (func, n) => {

      const [{ status, value }] = await Promise.allSettled([
        queue.add(()=>func())
      ]);
      if (status === 'fulfilled') {
        return value;
      }
      console.log(func, n);
      await wait();
      const startWait = performance.mark("START");

      console.log('waited',performance.measure(startWait));
      return poll(func, n + 1);
      //this absolutely fouls things up at n = 1
    };
    return func => poll(func, 1);
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
