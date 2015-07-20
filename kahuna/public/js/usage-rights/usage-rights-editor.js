import angular from 'angular';
import 'angular-elastic';

import template from './usage-rights-editor.html!text';
import './usage-rights-editor.css!';

import '../components/gr-confirm-delete/gr-confirm-delete.js';

export var usageRightsEditor = angular.module('kahuna.edits.usageRightsEditor', [
    'monospaced.elastic',
    'gr.confirmDelete'
]);

usageRightsEditor.controller('UsageRightsEditorCtrl',
                             ['$window', '$timeout', 'editsService', 'editsApi',
                              function($window, $timeout, editsService, editsApi) {

    var ctrl = this;

    // setting our initial values
    const { category: initialCatVal } = ctrl.usageRights.data;
    const noRights = { name: 'None', value: '' };

    ctrl.saving = false;
    ctrl.saved = false;
    ctrl.categories = [];
    ctrl.model = angular.extend({}, ctrl.usageRights.data);


    // TODO: What error would we like to show here?
    // TODO: How do we make this more synchronous? You can only resolve on the
    // routeProvider, which is actually bound to the UploadCtrl in this instance
    // SEE: https://github.com/angular/angular.js/issues/2095
    editsApi.getUsageRightsCategories().then(cats => setCategories(cats, initialCatVal));

    ctrl.save = () => {
        // FIXME [1]: We do this as images that didn't have usagerights in the first place will have
        // the no rights option, this is to make sure we don't override but rather delete.
        const data = modelToData(ctrl.model);

        if (data.category) {
            save(data);
        } else {
            remove();
        }
    }

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

    ctrl.resetModel = () => ctrl.model = {};

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
        
        // FIXME [1]: This is because we don't allow the override of NoRights yet (needs reindexing).
        // We don't however want to default the first category as that can be confusing.
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

        ctrl.usageRights.remove().
            then(updateSuccess).
            catch(uiError).
            finally(() => ctrl.saving = false);
    }

    function save(data) {
        ctrl.error = null;
        ctrl.saving = true;

        ctrl.usageRights.save(data).
            then(updateSuccess).
            catch(uiError).
            finally(() => ctrl.saving = false);
    }

    function updateSuccess(data) {
        ctrl.model = data;
        ctrl.onSave();
        setCategory(data.category);
        uiSaved();
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
