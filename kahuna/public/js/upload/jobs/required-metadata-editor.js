import angular from 'angular';
import template from './required-metadata-editor.html!text';
import datalistTemplate from './datalist.html!text';

export var jobs = angular.module('kahuna.upload.jobs.requiredMetadataEditor', []);


jobs.controller('RequiredMetadataEditorCtrl',
                ['$scope', '$window', 'editsApi', 'mediaApi',
                 function($scope, $window, editsApi, mediaApi) {

    var ctrl = this;

    ctrl.autocompletions = {};
    ctrl.saving = false;
    ctrl.disabled = () => ctrl.saving || ctrl.externallyDisabled;

    ctrl.save = function() {
        ctrl.saving = true;

        editsApi.updateMetadata(ctrl.id, ctrl.metadata)
            .then(() => $scope.jobEditor.$setPristine())
            .catch(() => $window.alert('Failed to save the changes, please try again.'))
            .finally(() => ctrl.saving = false);
    };




    ctrl.metadataSearch = (field, q) => {
        return mediaApi.metadataSearch(field,  { q }).then(resource => {
            return resource.data.map(d => d.key);
        });
    };

    $scope.$watch(() => ctrl.originalMetadata, () => {
        setMetadataFromOriginal();
    });

    function setMetadataFromOriginal() {
        // we only want a subset of the data
        ctrl.metadata = {
            byline: ctrl.originalMetadata.byline,
            credit: ctrl.originalMetadata.credit,
            description: ctrl.originalMetadata.description
        };
    }
}]);

jobs.controller('DescriptionPlaceholderCtrl',
                ['$scope',
                 function($scope) {

    var people = [
        'George Osborne',
        'A teary Nick Clegg',
        'Pop singer Rihanna',
        'US actress and director Angelina Jolie',
        'George W. Bush'
    ];

    var actions = [
        'eating',
        'caught with',
        'wrestling',
        'chants while marching for a third night of protests about',
        'making a toast to'
    ];

    var things = [
        'a large pheasant burger',
        'two human-sized rubber ducks',
        'a proposal for a new Union Jack',
        'the recently passed Owning The Internet bill',
        'the first crewed spaceship to reach Mars',
        'the largest ever koala recorded in history'
    ];

    function random(array) {
        var index = Math.floor(Math.random() * array.length);
        return array[index];
    }

    $scope.funnyDescription = [people, actions, things].map(random).join(' ');

}]);


jobs.directive('uiRequiredMetadataEditor', [function() {
    return {
        restrict: 'E',
        scope: {
            id: '=',
            originalMetadata: '=metadata', // [1]
            externallyDisabled: '=?disabled'
        },
        controller: 'RequiredMetadataEditorCtrl as ctrl',
        template: template,
        bindToController: true
    };
}]);


jobs.controller('DatalistController', ['$timeout', function($timeout) {
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

jobs.directive('uiDatalist', ['$window', function() {
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
        template: datalistTemplate
    }
}]);
