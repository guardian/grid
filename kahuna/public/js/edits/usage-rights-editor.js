import angular from 'angular';
import 'angular-elastic';
import template from './usage-rights-editor.html!text';

export var usageRightsEditor = angular.module('kahuna.edits.usageRightsEditor', [
    'monospaced.elastic'
]);

usageRightsEditor.controller('UsageRightsEditorCtrl',
                             ['$window', '$timeout', 'editsService', 'editsApi',
                              function($window, $timeout, editsService, editsApi) {

    var ctrl = this;
    ctrl.saving = false;
    ctrl.saved = false;
    ctrl.restrictions = ctrl.resource.data.restrictions;
    ctrl.categories = [];

    updateResource(ctrl.resource);

    // TODO: What error would we like to show here?
    // TODO: How do we make this more syncronous? You can only resolve on the
    // routeProvider, which is actually bound to the UploadCtrl in this instance
    // SEE: https://github.com/angular/angular.js/issues/2095
    editsApi.getUsageRightsCategories().then(cats => {
        const catVal = ctrl.resource.data.category;
        ctrl.categories = cats;
        // set the current category
        ctrl.category = cats.find(cat => cat.value === catVal);
    });

    ctrl.save = () => {
        if (ctrl.category) {
            save(modelToData(ctrl.category, ctrl.restrictions));
        } else {
            del();
        }
    };
    ctrl.isDisabled = () => ctrl.saving;
    ctrl.isNotEmpty = () => !angular.equals(ctrl.resource.data, {});

    function modelToData(cat, restrictions) {
        if (cat === 'free') {
            return { category: cat.value };

        }

        // annoyingly even if the restrictions isn't rendered, it's in the model.
        else {
            return {
                category: cat.value,
                restrictions: restrictions
            };
        }
    }

    function del() {
        ctrl.saving = true;

        editsService.remove(ctrl.resource, ctrl.image).
            then(resource => {
                updateResource(resource);
                ctrl.onSave();
                uiSaved();
            }).
            catch(uiError).
            finally(() => ctrl.saving = false);
    }

    function save(data) {
        ctrl.saving = true;

        editsService.
            update(ctrl.resource, data, ctrl.image).
            then(resource => {
                updateResource(resource);
                ctrl.onSave();
                uiSaved();
            }).
            catch(uiError).
            finally(() => ctrl.saving = false);
    }

    function updateResource(resource) {
        ctrl.resource = resource;
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
