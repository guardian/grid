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
        if (ctrl.usageRights.category === '') {
            del();
        } else {
            save();
        }
    };
    ctrl.isDisabled = () => ctrl.saving;
    ctrl.isNotEmpty = () => !angular.equals(ctrl.resource.data, {});
    ctrl.isVariableCost = isVariableCost;
    ctrl.cleanModel = cleanModel;


    // TODO: Hopefully we will lose the idea of variable cost in the future,
    // making "PR Image"'s cost restricted. Let's test it first though.
    function cleanModel() {
        if (!isVariableCost()) {
            delete ctrl.usageRights.cost;
            delete ctrl.usageRights.restrictions;
        } else {
            // set the default
            ctrl.usageRights.cost = 'conditional';
        }
    }

    function isVariableCost() {
        return ctrl.usageRights.category === 'PR Image';
    }

    function del() {
        ctrl.saving = true;

        editsService.remove(ctrl.resource, ctrl.image).
            then(updateResourceAndModel).
            catch(uiError).
            finally(() => ctrl.saving = false);
    }

    function save() {
        ctrl.saving = true;

        editsService.
            update(ctrl.resource, ctrl.usageRights, ctrl.image).
            then(resource => {
                updateResourceAndModel(resource);
                ctrl.onSave();
                uiSaved();
            }).
            catch(uiError).
            finally(() => ctrl.saving = false);
    }

    function updateResourceAndModel(resource) {
        ctrl.resource = resource;
        ctrl.usageRights = angular.extend({}, resource.data);
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
