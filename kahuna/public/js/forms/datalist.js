import angular from 'angular';

import template from './datalist.html!text';


export var datalist = angular.module('kahuna.forms.datalist', []);

datalist.controller('DatalistController', ['$timeout', function($timeout) {
    var keys = { left: 37, up: 38, right: 39, down: 40, enter: 13, esc: 27, tab: 9 };
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

    this.active = false;
    this.data = [];

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

            if (!(this.data.length === 1 && this.ngModel === this.data[0])) {
                this.active = true;
            }
        });
    };

    this.onFocus = this.onChange;

    this.onKeydown = (event) => {
        switch (event.which) {
            case keys.down:
                moveIndex(+1);
                break;

            case keys.up:
                moveIndex(-1);
                break;

            case keys.enter:
                if(this.active) {
                    this.setToCurrentValue(event);
                }
                break;
        }
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
