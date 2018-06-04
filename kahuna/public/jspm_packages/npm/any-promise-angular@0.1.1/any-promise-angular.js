/* */ 
import angular from 'angular';

export var mod = angular.module('anyPromise', []);

mod.factory('anyPromise', ['$q', function($q) {

    var PromiseAdapter = (func) => $q(func);

    PromiseAdapter.all = $q.all;
    PromiseAdapter.resolve = $q.when;
    PromiseAdapter.reject = $q.reject;
    // TODO: PromiseAdapter.race

    return PromiseAdapter;
}]);
