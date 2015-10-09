import angular from 'angular';
import Rx from 'rx';
import '../util/rx';

export const searchQueryService = angular.module('gr.searchQuery.service', ['util.rx']);

searchQueryService.factory('searchQueryService', ['observe$', function(observe$) {
    const query$ = new Rx.Subject();

    // TODO: When we update rx, we need to swap the seed / acc around

    const q$ = query$.scan('', (state, fn) => fn(state).trim());

    function hasLabel(q, label) {
        // TODO: It'd be nice to build this up from an API
        const r = new RegExp(`[#|label\:]${label}\\b`);
        return r.test(q);
    }

    function addLabel(label) {
        query$.onNext(state => {
            return `${state.trim()} #${label}`;
        });
    }

    function removeLabel(label) {
        query$.onNext(state => {
            return state.replace(`#${label}`, '').trim();
        });
    }

    function set(q) {
        query$.onNext(() => q || '');
    }

    return { addLabel, removeLabel, set, q$ };
}]);
