import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';

import {rxUtil} from '../util/rx';

export const rememberScrollTop = angular.module('gr.rememberScrollTop', [
    rxUtil.name
]);

rememberScrollTop.directive('grRememberScrollTop', ['subscribe$', function (subscribe$) {
    const storageKey = 'gr:rememberScrollTop';

    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            // Only remember if attribute if truthy. This is an annoying workaround to the
            // inability to add directives conditionally
            if (scope.$eval(attrs.grRememberScrollTop)) {
                const scrollEvents$ = Rx.DOM.fromEvent(element[0], 'scroll').debounce(500);
                const scrollTop$ = scrollEvents$.map(ev => ev.target.scrollTop);
                subscribe$(scope, scrollTop$, ev => {
                    window.localStorage.setItem(storageKey, ev);
                });

                scope.$on('gr:remember-scroll-top:apply', () => {
                    // Note: Number(null) -> 0
                    const scrollTop = Number(window.localStorage.getItem(storageKey));
                    element[0].scrollTop = scrollTop;
                });
            }
        }
    };
}]);
