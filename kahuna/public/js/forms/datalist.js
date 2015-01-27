import angular from 'angular';

import template from './datalist.html!text';


export var datalist = angular.module('kahuna.forms.datalist', []);

datalist.controller('DatalistController', ['$timeout', function($timeout) {
    var keys = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter', 27: 'esc', 9: 'tab' };
    var selectedIndex = 0;

    var moveIndex = index => {
        var where = selectedIndex + index;

        if (where === this.data.length) {
            selectedIndex = 0;
        } else if (where < 0) {
            selectedIndex = this.data.length-1;
        } else {
            selectedIndex = where;
        }
    };

    var keyFuncs = {
        up: () => moveIndex(-1),
        down: () => moveIndex(+1),
        esc: () => this.active = false,
        enter: event => { if(this.active) { this.setToCurrentValue(event); } }
    };

    this.active = false;
    this.data = [];

    // instead of creating an immutable set of data and have to clone it with the
    // correct selected object, we have one mutable index. This is easy to get
    // your head around as much as it is performant.
    this.setIndex = i => selectedIndex = i;
    this.isSelected = key => key === selectedIndex;
    this.setToCurrentValue = (event) => {
        // TODO: should we be doing this in the directive link?
        event.preventDefault();

        this.ngModel = this.data[selectedIndex];
        this.active = false;
    };

    this.onChange = () => {
        this.whenChanged({ q: this.ngModel }).then(data => {
            this.data = data;
            selectedIndex = 0;

            // only show if there is something to swap to
            if (!(this.data.length === 1 && this.ngModel === this.data[0])) {
                this.active = true;
            }
        });
    };

    this.onFocus = this.onChange;

    this.onKeydown = event => {
        var func = keyFuncs[keys[event.which]];
        func && func(event);
    };

    // this is to allow clicking on options element.
    // it would be nice to have it `onblur` of the actual component, but with
    // angular and HTML in general, it's all a bit hacky, more so that this.
    this.deactivate = () => $timeout(() => this.active = false, 150);
}]);

datalist.directive('uiDatalist', ['$window', function() {
    return {
        restrict: 'E',
        scope: {
            ngDisabled: '=',
            ngModel: '=',
            whenChanged: '&ngChange',
            name: '@',
            placeholder: '@'
        },
        controller: 'DatalistController',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    }
}]);
