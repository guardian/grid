import angular from 'angular';
import 'angular-elastic';
import template from './usage-rights-editor.html!text';

export var usageRightsEditor = angular.module('kahuna.edits.usageRightsEditor', [
    'monospaced.elastic'
]);

usageRightsEditor.controller('UsageRightsEditorCtrl',
                             ['$window', '$timeout', 'editsService',
                              function($window, $timeout, editsService) {

    var ctrl = this;
    ctrl.saving = false;
    ctrl.saved = false;
    ctrl.usageRights = {}; // this is the model used in the view

    updateResourceAndModel(ctrl.resource);

    ctrl.save = () => {
        ctrl.saving = true;

        editsService.
            update(ctrl.resource, ctrl.usageRights, ctrl.image).
            then(resource => {
                updateResourceAndModel(resource);
                ctrl.onSave();
                uiSaved();
            }).
            catch(uiError).
            finally(() => {
                ctrl.saving = false;
            });
    };

    ctrl.checkCategorySetOrDelete = () => {
        // delete if there is no category from the UI and if there is something
        // to delete
        if (!ctrl.usageRights.category && ctrl.isNotEmpty()) {
            ctrl.delete();
        }
    };

    ctrl.delete = () => {
        ctrl.saving = true;

        editsService.remove(ctrl.resource, ctrl.image).
            then(updateResourceAndModel).
            catch(uiError).
            finally(() => ctrl.saving = false);
    };

    ctrl.isDisabled = () => angular.isUndefined(ctrl.usageRights.category) || ctrl.saving;
    ctrl.isNotEmpty = () => !angular.equals(ctrl.resource.data, {});

    function updateResourceAndModel(resource) {
        ctrl.resource = resource;
        ctrl.usageRights = angular.extend({}, resource.data);

        // set the default state of cost, otherwise the view creates a blank option
        // in the select, thanks Angular.
        if (!ctrl.usageRights.cost) {
            ctrl.usageRights.cost = 'conditional';
        }
    }

    function uiSaved() {
        ctrl.saved = true;
        $timeout(() => ctrl.saved = false, 1500);
    }

    function uiError() {
        $window.alert('Failed to save the changes, please try again.');
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
            image: '=grImage',
            onSave: '&?grOnSave'
        }
    };
}]);
