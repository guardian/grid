import angular from 'angular';

import 'rx-angular';

/** Extend rx-angular for easier integration.
 */
export var rxHelpers = angular.module('rx.helpers', [
    'rx'
]);


// TODO: contribute these back to rx-angular?

rxHelpers.factory('observe$', ['observeOnScope', function(observeOnScope) {
    return function observe$(scope, watchExpression, objectEquality) {
        return observeOnScope(scope, watchExpression, objectEquality).
            map(({newValue}) => newValue);
    };
}]);

rxHelpers.factory('observeCollection$',
                  ['observeCollectionOnScope',
                   function(observeCollectionOnScope) {
    return function observeCollection$(scope, watchExpression) {
        return observeCollectionOnScope(scope, watchExpression).
            map(({newValue}) => newValue);
    };
}]);

rxHelpers.factory('subscribe$', [function() {
    return function subscribe$(scope, observable$, ...observer) {
        const subscription = observable$.subscribe(...observer);
        scope.$on('$destroy', () => subscription.dispose());
    };
}]);

rxHelpers.factory('observeCollectionOnScope', ['rx', function(rx) {
    return function(scope, watchExpression) {
        return rx.Observable.create(function (observer) {
            // Create function to handle old and new Value
            function listener (newValue, oldValue) {
                observer.onNext({ oldValue: oldValue, newValue: newValue });
            }

            // Returns function which disconnects the $watchCollection expression
            return scope.$watchCollection(watchExpression, listener);
        });
    };
}]);
