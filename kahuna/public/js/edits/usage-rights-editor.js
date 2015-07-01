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

    // setting our initial values
    const { category: initialCatVal } = ctrl.resource.data;

    ctrl.saving = false;
    ctrl.saved = false;
    ctrl.categories = [];
    ctrl.model = angular.extend({}, ctrl.resource.data);

    // TODO: What error would we like to show here?
    // TODO: How do we make this more syncronous? You can only resolve on the
    // routeProvider, which is actually bound to the UploadCtrl in this instance
    // SEE: https://github.com/angular/angular.js/issues/2095
    editsApi.getUsageRightsCategories().then(setCategories);

    ctrl.save = () => {
        ctrl.error = null;

        if (ctrl.category) {
            save(modelToData(ctrl.model));
        } else {
            del();
        }
    };

    ctrl.isDisabled = () => ctrl.saving;

    ctrl.isNotEmpty = () => !angular.equals(ctrl.resource.data, {});

    ctrl.pluraliseCategory = () => ctrl.category.name +
        (ctrl.category.name.toLowerCase().endsWith('image') ? 's' : ' images');

    ctrl.restrictionsPlaceholder = () => ctrl.getCost() === 'conditional' ?
        'e.g. Use in relation to the Windsor Triathlon only' :
        'Adding restrictions will mark this image as restricted. ' +
        'Leave blank if there aren\'t any.';

    ctrl.resetModel = () => ctrl.model = {};

    function setCategories(cats) {
        ctrl.categories = cats;

        // set the current category
        ctrl.category = cats.find(cat => cat.value === initialCatVal);
    }

    function modelToData(model) {
        return Object.keys(model).reduce((clean, key) => {
            // remove everything !thing including ""
            if (model[key]) {
                clean[key] = model[key];
            }

            return clean;
        }, { category: ctrl.category && ctrl.category.value });
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

    function uiError(error) {
        ctrl.error = error.body.errorMessage;
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
            image: '=grImage',
            resource: '=grResource',
            onSave: '&?grOnSave'
        }
    };
}]);
