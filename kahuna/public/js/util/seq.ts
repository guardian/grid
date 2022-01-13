import * as angular from 'angular';

export const seq = angular.module('util.seq', []);

seq.value('range', function* range(start: number, end: number) {
    for (let i = start; i <= end; i += 1) {
        yield i;
    }
});
