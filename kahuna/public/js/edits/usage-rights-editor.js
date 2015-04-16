import angular from 'angular';
import template from './usage-rights-editor.html!text';

export var usageRightsEditor = angular.module('kahuna.edits.usageRightsEditor', []);

usageRightsEditor.controller('UsageRightsEditorCtrl', [function() {
    console.log('Running!')
}]);


usageRightsEditor.directive('grUsageRightsEditor', [function() {
    return {
        restrict: 'E',
        controller: 'UsageRightsEditorCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template,
        scope: {}
    };
}]);
