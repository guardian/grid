import angular from 'angular';
import 'angular-elastic';
import template from './usage-rights-editor.html!text';
import './usage-rights-editor.css!';

export var usageRightsEditor = angular.module('kahuna.edits.usageRightsEditor', [
    'monospaced.elastic'
]);

usageRightsEditor.controller(
    'UsageRightsEditorCtrl',
    ['$q', '$scope', '$window', '$timeout', 'editsService', 'editsApi', 'onValChange',
    function($q, $scope, $window, $timeout, editsService, editsApi, onValChange) {

    var ctrl = this;

    ctrl.resetCategory = () => ctrl.category = {}
    ctrl.resetModel = () => ctrl.model = {};

    ctrl.multipleUsageRights = () => ctrl.usageRights.length > 1

    var getGroupCategory = (usageRights) => ctrl.categories.find(cat => cat.value === usageRights.reduce(
            (m, o) => (m == o.data.category) ? o.data.category : {},
            usageRights[0].data.category
    ));

    var getGroupModel = (usageRights) => (ctrl.multipleUsageRights()) ? {} : angular.extend({}, usageRights[0].data);

    ctrl.update = function() {
        ctrl.category = getGroupCategory(ctrl.usageRights);
        ctrl.model = getGroupModel(ctrl.usageRights);
    }

    // setting our initial values
    editsApi.getUsageRightsCategories().then((cats) => {
        ctrl.categories = cats;
        ctrl.update();
    });

    $scope.$watchCollection(() => ctrl.usageRights, onValChange(newUsageRights => {
        ctrl.update();
    }));

    ctrl.saving = false;
    ctrl.saved = false;
    ctrl.categories = [];

    ctrl.save = () => {
        ctrl.error = null;

        if (ctrl.category) {
            save(modelToData(ctrl.model));
        } else {
            remove();
        }
    };

    ctrl.isDisabled = () => ctrl.saving;

    ctrl.isNotEmpty = () => !angular.equals(ctrl.model, {});

    ctrl.pluraliseCategory = () => ctrl.category.name +
        (ctrl.category.name.toLowerCase().endsWith('image') ? 's' : ' images');

    ctrl.restrictionsPlaceholder = () => ctrl.getCost() === 'conditional' ?
        'e.g. Use in relation to the Windsor Triathlon only' :
        'Adding restrictions will mark this image as restricted. ' +
        'Leave blank if there aren\'t any.';

    ctrl.descriptionPlaceholder = "Remove all restrictions on the use of this image."

    ctrl.getOptionsFor = property => {
        const key = ctrl.category
                        .properties
                        .find(prop => prop.name === property.optionsMapKey)
                        .name;
        const val = ctrl.model[key];
        return property.optionsMap[val];
    };

    function modelToData(model) {
        return Object.keys(model).reduce((clean, key) => {
            // remove everything !thing including ""
            if (model[key]) {
                clean[key] = model[key];
            }

            return clean;
        }, { category: ctrl.category && ctrl.category.value });
    }

    function remove() {
        ctrl.saving = true;
        $q.all(ctrl.usageRights.map((usageRights) => {
            return ctrl.usageRights.remove()
        })).catch(uiError).
            finally(() => ctrl.saving = false);
    }

    function save(data) {
        ctrl.saving = true;
        $q.all(ctrl.usageRights.map((usageRights) => {
            return usageRights.save(data);
        })).catch(uiError).
            finally(() => updateSuccess());
    }

    function updateSuccess() {
        ctrl.onSave();
        uiSaved();
        ctrl.saving = false;
    }

    function updateResource(resource) {
        ctrl.usageRights.resource = resource;
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
            usageRights: '=grUsageRights',
            onSave: '&?grOnSave'
        }
    };
}]);
