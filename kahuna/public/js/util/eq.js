import angular from 'angular';

export var eq = angular.module('util.eq', []);

eq.value('onValChange', function(fn) {
    return function(newVal, oldVal, objectEquality) {
        if (!angular.equals(newVal, oldVal)) {
            fn(newVal, oldVal, objectEquality);
        }
    };
});
