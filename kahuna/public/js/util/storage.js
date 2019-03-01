import angular from 'angular';

export const storage  = angular.module('util.storage', []);

storage.factory('storage', ['$window', function($window) {
  function setJs(key, val, toSessionStorage = false) {

    if (toSessionStorage) {
      $window.sessionStorage.setItem(key, JSON.stringify(val));
    } else {
      $window.localStorage.setItem(key, JSON.stringify(val));
    }
  }

  function getJs(key, fromSessionStorage) {
    const val = fromSessionStorage ?
      $window.sessionStorage.getItem(key) :
      $window.localStorage.getItem(key);
    try {
      return JSON.parse(val);
    } catch (_) {
      throw new Error(`Could not parse JSON: ${val} for: ${key}`);
    }
  }

  function clearJs(key) {
    $window.sessionStorage.removeItem(key);
    $window.localStorage.removeItem(key);
  }

  return {
    setJs,
    getJs,
    clearJs
  };
}]);
