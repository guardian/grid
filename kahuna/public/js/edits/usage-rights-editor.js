import angular from 'angular';
import template from './usage-rights-editor.html!text';

export var usageRightsEditor = angular.module('kahuna.edits.usageRightsEditor', []);

usageRightsEditor.controller('UsageRightsEditorCtrl',
                             ['$window', '$timeout', 'editsService',
                              function($window, $timeout, editsService) {

    var ctrl = this;
    ctrl.saving = false;
    ctrl.saved = false;

    setModelFromResource(ctrl.resource);

    ctrl.save = () => save(ctrl.usageRights);

    ctrl.delete = () => save({});

    ctrl.isDisabled = () => !Boolean(ctrl.usageRights.category) || this.saving;

    function save(data) {
        ctrl.saving = true;

        return editsService.
            update(ctrl.resource, data, ctrl.image).
            then(resource => {
                ctrl.resource = resource;
                setModelFromResource(resource);

                ctrl.saved = true;
                $timeout(() => ctrl.saved = false, 1500);
            }).
            catch(() => $window.alert('Failed to save the changes, please try again.')).
            finally(() => {
                ctrl.saving = false;
            });
    }

    function setModelFromResource(resource) {
        ctrl.usageRights = angular.extend({}, resource.data);
    }

}]);


usageRightsEditor.directive('grUsageRightsEditor', [function() {
    return {
        restrict: 'E',
        controller: 'UsageRightsEditorCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template,
        scope: {
            resource: '=grUsageRights',
            image: '=grImage'
        }
    };
}]);
