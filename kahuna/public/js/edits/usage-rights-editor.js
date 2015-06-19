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
    const { restrictions, category: categoryVal } =
        angular.extend({}, ctrl.resource.data);

    ctrl.saving = false;
    ctrl.saved = false;
    ctrl.restrictions = restrictions;
    ctrl.categories = [];

    updateResource(ctrl.resource);

    // TODO: What error would we like to show here?
    // TODO: How do we make this more syncronous? You can only resolve on the
    // routeProvider, which is actually bound to the UploadCtrl in this instance
    // SEE: https://github.com/angular/angular.js/issues/2095
    editsApi.getUsageRightsCategories().then(setCategories);

    ctrl.save = () => {
        uiReset();
        save(modelToData(ctrl.category, ctrl.restrictions));
    };

    ctrl.delete = () => {
        uiReset();
        del();
    };

    ctrl.isDisabled = () => ctrl.saving;

    ctrl.isNotEmpty = () => !angular.equals(ctrl.resource.data, {});

    ctrl.getCost = () => {
        // TODO: Can we move this to the server
        if (ctrl.restrictions) { return 'conditional'; }

        return ctrl.category && ctrl.category.cost;
    };

    ctrl.pluraliseCategory = () => ctrl.category.name +
        (ctrl.category.name.toLowerCase().endsWith('image') ? 's' : ' images');

    ctrl.restrictionsPlaceholder = () => ctrl.getCost() === 'conditional' ?
        'e.g. Use in relation to the Windsor Triathlon only' :
        'Adding restrictions will mark this image as restricted. ' +
        'Leave blank if there aren\'t any.';

    function setCategories(cats) {
        ctrl.categories = cats;

        // set the current category
        ctrl.category = cats.find(cat => cat.value === categoryVal);
    }

    function modelToData(cat, restrictions) {
        const cleanCat = cat && cat.value;
        const dirty = { category: cleanCat, restrictions };

        const data = Object.keys(dirty).reduce((prev, curr) => {
            // remove all rubbish including ""
            if (dirty[curr]) { prev[curr] = dirty[curr]; }
            return prev;
        }, {});

        return data;
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
        console.log('saving...', data);
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

    function uiReset() {
        ctrl.error = null;
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
