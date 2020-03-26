import angular from 'angular';

export var async = angular.module('util.async', []);

let concurrentPolls = 0 ;
const maxConcurrentPolls = 10;
const timeoutError = new Error('timeout');
/**
 * Return a lazy function that will yield before calling the input `func`.
 */
async.factory('nextTick',
  ['$timeout',
    function($timeout) {

      function nextTick(func) {
        return () => $timeout(func, 0);
      }

      return nextTick;
    }]);


/**
 * Return a Promise that is resolved with no value after `duration`.
 */
async.factory('delay',
  ['$q', '$timeout',
    function($q, $timeout) {

      function delay(duration) {
        var defer = $q.defer();
        $timeout(defer.resolve, duration);
        return defer.promise;
      }

      return delay;
    }]);


async.factory('race',
  ['$q',
    function($q) {

      function race(promises) {
        var first = $q.defer();
        promises.forEach(promise => {
          promise.then(first.resolve, first.reject);
        });
        return first.promise;
      }

      return race;
    }]);


async.factory('poll',
  ['$q', 'delay', 'race',
    function($q, delay, race) {

      function poll(func, pollEvery, maxWait) {
        var timeout = delay(maxWait).then(() => $q.reject(new Error('timeout')));

        // Returns the result of promise or a rejected timeout
        // promise, whichever happens first
        function withTimeout(promise) {
          return race([promise, timeout]);
        }

        const JITTER = 100;
        const BACKOFF = 2;
        let i = 0;

        const withBackoff = () => {
            const jitter = Math.floor(Math.random() * JITTER);
            const wait = pollEvery * BACKOFF ** (i++) + jitter;
            return wait;
        };

        function pollRecursive() {
          let isRunning = true;
          if (concurrentPolls > maxConcurrentPolls) {
            console.warn("Too many concurrent polls.", concurrentPolls, func);
            return withTimeout(delay(withBackoff())).then(pollRecursive);
          }
          concurrentPolls += 1;
          return func().then(result => {
            if (!isRunning){
              console.error("THEN AFTER CANCEL!", func, result);
              return result;
            }
            concurrentPolls -= 1;
            return result;
          }).catch((error) => {
            isRunning = false;
            if (error !== timeoutError){
              console.error("Something blew up while polling",error, func);
            }
            concurrentPolls -= 1;
            return withTimeout(delay(withBackoff())).then(pollRecursive);
          });
        }

        return withTimeout(pollRecursive());
      }

      return poll;
    }]);


// Polling with sensible defaults for API polling
async.factory('apiPoll', ['poll', function(poll) {

  const pollFrequency = 500; // ms
  const pollTimeout   = 30 * 1000; // ms

  return func => poll(func, pollFrequency, pollTimeout);
}]);


// Return a promise resolved the next time the event is fired on the scope
async.factory('onNextEvent', ['$q', function($q) {

  function onNextEvent(scope, event) {
    const defer = $q.defer();
    const unregister = scope.$on(event, (_, arg) => defer.resolve(arg));
    return defer.promise.finally(unregister);
  }

  return onNextEvent;
}]);
