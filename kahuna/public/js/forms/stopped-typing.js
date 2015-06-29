import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';

export var stoppedTyping = angular.module('kahuna.forms.stoppedTyping', []);

stoppedTyping.directive('grStoppedTyping', function() {
    return {
        restrict: 'A',
        require: '?ngModel',
        link: function(scope, element, attrs, ngModel) {
            const elem = element[0];
            const upstream = Rx.DOM.fromEvent(elem, 'keyup');
            const throttle = attrs.grStoppedTyping || 750;
            const stopstream = upstream
                .map(e => e.target.value)
                .throttle(throttle)
                .distinctUntilChanged();

            stopstream.subscribe(val => {
                ngModel.$setViewValue(val, 'gr:stopped-typing');
                ngModel.$commitViewValue();
            });
        }
    }
});
