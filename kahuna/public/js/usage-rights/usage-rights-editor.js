import angular from 'angular';
import 'angular-elastic';

import template from './usage-rights-editor.html!text';
import './usage-rights-editor.css!';

import '../components/gr-confirm-delete/gr-confirm-delete.js';

export var usageRightsEditor = angular.module('kahuna.edits.usageRightsEditor', [
    'monospaced.elastic',
    'gr.confirmDelete'
]);

usageRightsEditor.controller(
    'UsageRightsEditorCtrl',
    ['$q', '$scope', '$window', '$timeout', 'editsService', 'editsApi', 'onValChange',
    function($q, $scope, $window, $timeout, editsService, editsApi, onValChange) {

    var ctrl = this;

    const { category: initialCatVal } = getGroupCategory(ctrl.usageRights);
    const noRights = { name: 'None', value: '' };

    ctrl.resetCategory = () => ctrl.category = {};
    ctrl.resetModel = () => ctrl.model = {};

    ctrl.multipleUsageRights = () => ctrl.usageRights.length > 1;

    var getGroupCategory = (usageRights) => ctrl.categories.find(cat => cat.value === usageRights.reduce(
            (m, o) => (m == o.data.category) ? o.data.category : {},
            usageRights[0].data.category
    ));

    var getGroupModel = (usageRights) => (ctrl.multipleUsageRights()) ? {} : angular.extend({}, usageRights[0].data);

    ctrl.update = function() {
        ctrl.category = getGroupCategory(ctrl.usageRights);
        ctrl.model = getGroupModel(ctrl.usageRights);
    };

    // setting our initial values
    editsApi.getUsageRightsCategories().then((cats) => {
        setCategories(cats, initialCatVal);
        ctrl.update();
    });

    $scope.$watchCollection(() => ctrl.usageRights, onValChange(newUsageRights => {
        ctrl.update();
    }));

    ctrl.saving = false;
    ctrl.saved = false;
    ctrl.categories = [];
    ctrl.model = angular.extend({}, ctrl.usageRights.data);


    // TODO: What error would we like to show here?
    // TODO: How do we make this more synchronous? You can only resolve on the
    // routeProvider, which is actually bound to the UploadCtrl in this instance
    // SEE: https://github.com/angular/angular.js/issues/2095
    ctrl.save = () => {
        // FIXME [1]: We do this as images that didn't have usagerights in the first place will have
        // the no rights option, this is to make sure we don't override but rather delete.
        const data = modelToData(ctrl.model);

        if (data.category) {
            save(data);
        } else {
            remove();
        }
    };

    ctrl.remove = remove;

    ctrl.cancel = () => ctrl.onCancel();

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

    function setCategories(cats, selected) {
        ctrl.categories = cats;
        setCategory(selected);

        // FIXME [1]: This is because we don't allow the override of
        // NoRights yet (needs reindexing). We don't however want to
        // default the first category as that can be confusing.
        if (!ctrl.category) {
            ctrl.categories = [noRights].concat(ctrl.categories);
            ctrl.category = noRights;
        }
    }

    function setCategory(val) {
        ctrl.category = ctrl.categories.find(cat => cat.value === val);
    }

    function modelToData(model) {
        const modelWithCat = angular.extend({},
            model, { category: ctrl.category && ctrl.category.value });

        return Object.keys(modelWithCat).reduce((clean, key) => {
            // remove everything !thing including ""
            if (modelWithCat[key]) {
                clean[key] = modelWithCat[key];
            }

            return clean;
        }, {});
    }

    function remove() {
        ctrl.error = null;
        ctrl.saving = true;
        $q.all(ctrl.usageRights.map((usageRights) => {
            return ctrl.usageRights.remove()
        })).catch(uiError).
            finally(() => ctrl.saving = false);
    }

    function save(data) {
        ctrl.error = null;
        ctrl.saving = true;
        $q.all(ctrl.usageRights.map((usageRights) => {
            return usageRights.save(data);
        })).catch(uiError).
            finally(() => updateSuccess(data));
    }

    function updateSuccess(data) {
        ctrl.model = data;
        ctrl.onSave();
        setCategory(data.category);
        uiSaved();
        ctrl.saving = false;
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
            onCancel: '&?grOnCancel',
            onSave: '&?grOnSave'
        }
    };
}]);
