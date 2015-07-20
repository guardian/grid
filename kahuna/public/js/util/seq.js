import angular from 'angular';

export var seq = angular.module('util.seq', []);

seq.value('range', function* range(start, end) {
    for (let i = start; i <= end; i += 1) {
        yield i;
    }
});
