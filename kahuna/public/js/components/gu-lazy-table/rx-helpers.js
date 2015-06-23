import angular from 'angular';

import 'rx-angular';

/** Extend rx-angular for easier integration.
 */
export var rxHelpers = angular.module('rx.helpers', [
    'rx'
]);


rxHelpers.factory('observe$', ['observeOnScope', function(observeOnScope) {
    return function observe$(scope, watchExpression) {
        return observeOnScope(scope, watchExpression).
            map(({newValue}) => newValue);
    };
}]);

rxHelpers.factory('subscribe$', [function() {
    return function subscribe$(scope, observable$, ...observer) {
        const subscription = observable$.subscribe(...observer);
        scope.$on('$destroy', () => subscription.dispose());
    };
}]);
