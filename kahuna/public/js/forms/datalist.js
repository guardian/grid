import angular from 'angular';

import template from './datalist.html!text';
import '../util/eq';

export var datalist = angular.module('kahuna.forms.datalist', ['util.eq']);



datalist.directive('grDatalist', ['onValChange', function(onValChange) {
    return {
        restrict: 'E',
        transclude: true,
        scope: {
            search: '&grSearch'
        },
        template: `
            <div class="datalist">
                <ng:transclude></ng:transclude>
                <div class="datalist__options" ng:if="ctrl.active">
                    <div class="datalist__option"
                         ng:repeat="(key, result) in ctrl.results"
                         ng:click="ctrl.setValueTo(result)"
                         ng:class="{ 'datalist__option--selected': ctrl.isSelected(key) }">
                         {{result}}
                    </div>
                </div>
            </div>
        `,
        controllerAs: 'ctrl',
        controller: [function() {
            var ctrl = this;
            var selectedIndex = 0;

            ctrl.results = [];

            ctrl.moveIndex = movement =>
                selectedIndex = (selectedIndex + movement + ctrl.results.length) % ctrl.results.length;

            ctrl.isSelected = key => key === selectedIndex;

            ctrl.searchFor = q =>
                ctrl.search({ q }).then(results => ctrl.results = results);

            ctrl.setValueTo = value => ctrl.value = value;
            ctrl.setValueFromIndex = index => ctrl.value = ctrl.results[index];
        }],
        bindToController: true
    }
}]);


datalist.directive('grDatalistInput', ['onValChange', function(onValChange) {
    return {
        restrict: 'A',
        require:['^grDatalist', '?ngModel'],

        link: function(scope, element, _/*attrs*/, [parentCtrl, ngModel]) {
            parentCtrl.active = false;

            const input = angular.element(element[0]);
            const keys = { 38: 'up', 40: 'down', 13: 'enter', 27: 'esc', 9: 'tab' };
            const keyFuncs = {
                up:    () => parentCtrl.moveIndex(-1),
                down:  () => parentCtrl.moveIndex(+1),
                esc:   () => parentCtrl.active = false,
                enter: () => parentCtrl.setValueFromIndex(parentCtrl.selectedIndex)
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
    }
}]);

















datalist.controller('DatalistController',
                    ['$scope', '$timeout', 'onValChange',
                    function($scope, $timeout, onValChange) {

    var keys = { 38: 'up', 40: 'down', 13: 'enter', 27: 'esc', 9: 'tab' };
    var selectedIndex = 0;

    var ctrl = this;
    ctrl.value = ctrl.initialValue;
    ctrl.active = false;
    ctrl.data = [];

    var moveIndex = index =>
        selectedIndex = (selectedIndex + index + ctrl.data.length) % ctrl.data.length;

    var keyFuncs = {
        up: ()    => moveIndex(-1),
        down: ()  => moveIndex(+1),
        esc: ()   => ctrl.active = false,
        enter: () => ctrl.setToCurrentValue()
    };

    // instead of creating an immutable set of data and have to clone it with the
    // correct selected object, we have one mutable index. This is easy to get
    // your head around as much as it is performant.
    ctrl.setIndex = i => selectedIndex = i;
    ctrl.isSelected = key => key === selectedIndex;
    ctrl.setToCurrentValue = () => {
        ctrl.value = ctrl.data[selectedIndex];
        if (ctrl.onValueSelect) {
            ctrl.onValueSelect({ value: ctrl.value });
        }
        ctrl.active = false;
    };

    ctrl.search = q => {
        ctrl.request({ q }).then(data => {
            ctrl.data = data;
            selectedIndex = 0;

            var isOnlySuggestion = !(ctrl.data.length === 1 && q === ctrl.data[0]);
            if (ctrl.data.length !== 0 && isOnlySuggestion) {
                ctrl.active = true;
            } else {
                ctrl.active = false;
            }
        });
    };

    // This is here so you can change the value from the parent ctrl.
    if (ctrl.watchValue) {
        $scope.$watch(() => ctrl.watchValue, onValChange(newVal => {
            ctrl.value = newVal;
        }));
    }

    // TODO: should we be doing key / change stuff in the directive link?
    ctrl.onKeydown = event => {
        var func = keyFuncs[keys[event.which]];

        if (ctrl.active && func) {
            event.preventDefault();
            func(event);
        }
    };

    // this is to allow clicking on options element.
    // it would be nice to have it `onblur` of the actual component, but with
    // angular and HTML in general, it's all a bit hacky, more so that this.
    ctrl.deactivate = () => {
        $timeout(() => ctrl.active = false, 150);
        if (ctrl.onDeactivate) {
            ctrl.onDeactivate({value: ctrl.value});
        }
    };

}]);

datalist.directive('uiDatalist', ['$window', function() {
    return {
        restrict: 'E',
        scope: {
            onValueSelect: '&?',
            onDeactivate: '&?',
            request: '&',
            name: '@',
            placeholder: '@',
            ngDisabled: '=',
            initialValue: '@',
            watchValue: '=?'
        },
        controller: 'DatalistController',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
