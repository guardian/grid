import angular from 'angular';

import template from './datalist.html!text';


export var datalist = angular.module('kahuna.forms.datalist', []);

datalist.controller('DatalistController', ['$timeout', function($timeout) {
    var keys = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter', 27: 'esc', 9: 'tab' };
    var selectedIndex = 0;

    var moveIndex = index => {
        selectedIndex = (selectedIndex + index + this.data.length) % this.data.length;
    };

    var keyFuncs = {
        up: () => moveIndex(-1),
        down: () => moveIndex(+1),
        esc: () => this.active = false,
        enter: () => this.setToCurrentValue()
    };

    this.active = false;
    this.data = [];

    // instead of creating an immutable set of data and have to clone it with the
    // correct selected object, we have one mutable index. This is easy to get
    // your head around as much as it is performant.
    this.setIndex = i => selectedIndex = i;
    this.isSelected = key => key === selectedIndex;
    this.setToCurrentValue = () => {
        // Annoyingly setting the model doesn't seem to bubble up to the parent
        // model, even though it's bi-directionally bound. So we send a message
        // saying we've changed it
        this.ngModel = this.data[selectedIndex];

        if (this.onselect) {
            this.onselect({ value: this.ngModel });
        }
        this.active = false;
    };

    this.search = q => {
        this.request({ q }).then(data => {
            this.data = data;
            selectedIndex = 0;

            var isOnlySuggestion = !(this.data.length === 1 && q === this.data[0]);
            if (this.data.length !== 0 && isOnlySuggestion) {
                this.active = true;
            } else {
                this.active = false;
            }
        });
    };

    // TODO: should we be doing key / change stuff in the directive link?
    this.onKeydown = event => {
        var func = keyFuncs[keys[event.which]];

        if (this.active && func) {
            event.preventDefault();
            func(event);
        }
    };

    // Search on keyup so that we can assign a callback on the model change event
    // FIXME: a better way of looking for a change?
    var lastSearchQ = this.ngModel;
    this.onKeyup = event => {
        const q = event.target.value;

        if (q !== lastSearchQ) {
            this.search(q);
            lastSearchQ  = q;
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
            onselect: '&?',
            request: '&',
            name: '@',
            placeholder: '@',
            ngDisabled: '=',
            // TODO: decouple this from the parent's model
            ngModel: '=',
            ngModelOptions: '='
        },
        controller: 'DatalistController',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
