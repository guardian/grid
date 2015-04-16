import angular from 'angular';
import template from './usage-rights-editor.html!text';

export var usageRightsEditor = angular.module('kahuna.edits.usageRightsEditor', []);

usageRightsEditor.controller('UsageRightsEditorCtrl',
                             ['$timeout', 'editsService',
                              function($timeout, editsService) {

    var ctrl = this;
    ctrl.saving = false;
    ctrl.saved = false;

    setModelFromResource(ctrl.resource);

    ctrl.save = () => {
        ctrl.saving = true;

        editsService.
            update(ctrl.resource, ctrl.usageRights, ctrl.image).
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

        ctrl.resource.put({data: ctrl.usageRights}).then(newResource => {
            ctrl.resource = newResource;
            setModelFromResource(newResource);
        });
    };

    ctrl.isDisabled = () => !Boolean(ctrl.usageRights.category) || this.saving;

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
