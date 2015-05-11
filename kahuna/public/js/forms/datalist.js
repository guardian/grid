import angular from 'angular';

import template from './datalist.html!text';


export var datalist = angular.module('kahuna.forms.datalist', []);

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
    $scope.$watch(() => ctrl.watchValue, onValChange(newVal => {
        ctrl.value = newVal;
    }));

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
