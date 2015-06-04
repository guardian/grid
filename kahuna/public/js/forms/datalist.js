import angular from 'angular';

import template from './datalist.html!text';
import '../util/eq';

export var datalist = angular.module('kahuna.forms.datalist', ['util.eq']);


datalist.directive('grDatalist', [function() {
    return {
        restrict: 'E',
        transclude: true,
        scope: {
            search: '&grSearch'
        },
        template: template,
        controllerAs: 'ctrl',
        controller: [function() {
            var ctrl = this;
            var selectedIndex = 0;

            ctrl.results = [];

            ctrl.moveIndex = movement =>
                selectedIndex = (selectedIndex + movement + ctrl.results.length) %
                                ctrl.results.length;

            ctrl.isSelected = key => key === selectedIndex;

            ctrl.searchFor = q =>
                ctrl.search({ q }).then(results => ctrl.results = results);

            ctrl.setValueTo = value => ctrl.value = value;
            ctrl.setValueFromSelectedIndex = () => {
                ctrl.value = ctrl.results[selectedIndex];
            };
        }],
        bindToController: true
    };
}]);


datalist.directive('grDatalistInput', ['onValChange', function(onValChange) {
    return {
        restrict: 'A',
        require:['^grDatalist', '?ngModel'],

        link: function(scope, element, _/*attrs*/, [parentCtrl, ngModel]) {
            // I've put this here to be able to access it in the template
            // Not sure where else it could go really.
            parentCtrl.active = false;

            const input = angular.element(element[0]);
            const keys = { 38: 'up', 40: 'down', 13: 'enter', 27: 'esc', 9: 'tab' };
            const keyFuncs = {
                up:    () => parentCtrl.moveIndex(-1),
                down:  () => parentCtrl.moveIndex(+1),
                esc:   () => parentCtrl.active = false,
                enter: () => parentCtrl.setValueFromSelectedIndex()
            };

            input.on('keyup', event => {
                const func = keyFuncs[keys[event.which]];

                if (func && parentCtrl.active) {
                    event.preventDefault();
                    scope.$apply(func);
                } else {
                    parentCtrl.searchFor(input.val()).then(activate);
                }
            });

            input.on('click', () => parentCtrl.searchFor(input.val()).then(activate));

            scope.$watch(() => parentCtrl.value, onValChange(newVal => {
                ngModel.$setViewValue(newVal, 'gr:datalist:update');
                ngModel.$commitViewValue();
                ngModel.$render();
                deactivate();
            }));

            function activate(results) {
                const isOnlyResult = results.length === 1 && input.val() === results[0];
                const noResults = results.length === 0 || isOnlyResult;

                parentCtrl.active = !noResults;
            }

            function deactivate() {
                parentCtrl.selectedIndex = 0;
                parentCtrl.active = false;
            }
        }
    };
}]);
