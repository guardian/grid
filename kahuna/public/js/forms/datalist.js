import angular from 'angular';

import template from './datalist.html';
import '../util/eq';

export var datalist = angular.module('kahuna.forms.datalist', ['util.eq']);


datalist.directive('grDatalist', ['$q', function($q) {
    return {
        restrict: 'E',
        transclude: true,
        scope: {
            search:   '&grSearch',
            onSelect: '&?grOnSelect'
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

            ctrl.setIndex = key => selectedIndex = key;

            ctrl.isSelected = key => key === selectedIndex;

            ctrl.searchFor = (q) => {
                return $q.when(ctrl.search({ q })).
                    then(results => ctrl.results = results).
                    then(() => selectedIndex = 0);
            };

            ctrl.setValueTo = value => {
                ctrl.value = value;
                if (ctrl.onSelect) {
                    ctrl.onSelect({$value: value});
                }
            };

            ctrl.setValueFromSelectedIndex = () => {
                ctrl.setValueTo(ctrl.results[selectedIndex]);
            };

            ctrl.reset = () => {
                selectedIndex = 0;
                ctrl.results = [];
            };
        }],
        bindToController: true
    };
}]);


datalist.directive('grDatalistInput',
                   ['$timeout', 'onValChange',
                   function($timeout, onValChange) {
    return {
        restrict: 'A',
        require:['^grDatalist', '?ngModel'],
        link: function(scope, element, attrs, [parentCtrl, ngModel]) {
            const valueSelectorFn = attrs.grDatalistInputSelector;
            const valueUpdaterFn  = attrs.grDatalistInputUpdater;
            const onCancel = attrs.grDatalistInputOnCancel;

            function valueSelector(value) {
                if (valueSelectorFn) {
                    return scope.$eval(valueSelectorFn, {$value: value});
                } else {
                    return value;
                }
            }
            function valueUpdater(currentValue, selectedValue) {
                if (valueUpdaterFn) {
                    return scope.$eval(valueUpdaterFn, {
                        $currentValue: currentValue,
                        $selectedValue: selectedValue
                    });
                } else {
                    return selectedValue;
                }
            }

            // This feels like it should be set to this directive, but it is
            // needed in the template so we set it here.
            parentCtrl.active = false;

            const input = angular.element(element[0]);
            const keys = { 38: 'up', 40: 'down', 13: 'enter', 27: 'esc', 9: 'tab' };
            const keyFuncs = {
                up:    () => parentCtrl.moveIndex(-1),
                down:  () => parentCtrl.moveIndex(+1),
                esc:   deactivate
            };

            // Enter is on keydown to prevent the submit event being
            // propagated up.
            input.on('keydown', event => {
                if (keys[event.which] === 'enter' && parentCtrl.active) {
                    event.preventDefault();
                    scope.$apply(parentCtrl.setValueFromSelectedIndex);
                }
                //to prevent the caret moving to the start/end of the input box
                if (parentCtrl.active &&
                    ( keys[event.which] === 'up' || keys[event.which] === 'down' ) ) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            });

            input.on('keyup', event => {
                const func = keyFuncs[keys[event.which]];

                if (func && parentCtrl.active) {
                    event.preventDefault();
                    scope.$apply(func);
                } else if (keys[event.which] !== 'enter' && keys[event.which] !== 'esc') {
                    searchAndActivate();
                } else if (keys[event.which] === 'esc' && !parentCtrl.active) {
                    scope.$apply(onCancel);
                }
            });

            input.on('focus', searchAndActivate);
            input.on('click', searchAndActivate);

            // This is done to make the results disappear when you select
            // somewhere else on the document, but still allowing you to click
            // a result. What would have been nicer would be to have looked for
            // a `document.click` and `stopPropagation`ed on the parent element.
            // Unfortunately this isn't possible as a `document.click` is fired
            // from the submit button of a form (which most forms have).
            input.on('blur', () => $timeout(deactivate, 150));

            scope.$watch(() => parentCtrl.value, onValChange(newVal => {
                const updatedValue = valueUpdater(input.val(), newVal);
                ngModel.$setViewValue(updatedValue, 'gr:datalist:update');
                ngModel.$commitViewValue();
                ngModel.$render();

                deactivate();
            }));

            function searchAndActivate() {
                parentCtrl.searchFor(valueSelector(input.val())).then(activate);
            }

            function activate(results) {
                const inputMatchesFirstResult = valueSelector(input.val()) === results[0];
                const isOnlyResult = results.length === 1 && inputMatchesFirstResult;
                const noResults = results.length === 0 || isOnlyResult;

                parentCtrl.active = !noResults;

            }

            function deactivate() {
                parentCtrl.active = false;
                parentCtrl.reset();
            }
        }
    };
}]);
