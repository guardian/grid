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

    ctrl.saving = false;
    ctrl.saved = false;
    ctrl.categories = [];
    ctrl.originalCats = [];
    ctrl.model = angular.extend({}, ctrl.usageRights.data);

    const multiRights = { name: 'Multiple categories', value: '' };
    const noRights = { name: 'None', value: '' };
    const catsWithNoRights = () => [noRights].concat(ctrl.originalCats);
    const catsWithMultiRights = () => [multiRights].concat(ctrl.originalCats);
    const setStandardCats = () => ctrl.categories = ctrl.originalCats;
    const setNoRightsCats = () => {
        ctrl.categories = catsWithNoRights();
        ctrl.category = noRights;
    };
    const setMultiRightsCats = () => {
        ctrl.categories = catsWithMultiRights();
        ctrl.category = multiRights;
    };


    const getGroupCategory =
        (usageRights, cats) => cats.find(cat => cat.value === usageRights.reduce(
            (m, o) => (m == o.data.category) ? o.data.category : {},
            usageRights[0].data.category
        ));

    const getGroupModel = usageRights =>
        ctrl.multipleUsageRights() ? {} : angular.extend({}, usageRights[0].data);

    ctrl.reset = () => {
        ctrl.showRestrictions = false;
        ctrl.model = {};
    };
    ctrl.multipleUsageRights = () => ctrl.usageRights.length > 1;

    ctrl.update = function() {
        ctrl.category = getGroupCategory(ctrl.usageRights, ctrl.categories);

        // If we have multi or no rights we need to add the option to
        // the drop down and select it to give the user feedback as to
        // what's going on (can't use terner).
        if (!ctrl.category) {
            if (ctrl.usageRights.length > 1) {
                setMultiRightsCats();
            } else {
                setNoRightsCats();
            }
        } else {
            setStandardCats();
        }


        ctrl.model = getGroupModel(ctrl.usageRights);
        ctrl.showRestrictions = angular.isDefined(ctrl.model.restrictions);
    };

    // setting our initial values
    editsApi.getUsageRightsCategories().then(cats => {
        const categoriesCopy = angular.copy(cats);

        categoriesCopy.forEach(cat => {
            cat.properties.forEach((property, i) => {
                let propertyOptions = property.required ? [] : [{key: 'None', value: null}];

                if (property.options) {
                    property.options.forEach(option => {
                        propertyOptions.push({key: option, value: option});
                    });

                    cat.properties[i].options = propertyOptions;
                }
            });
        });

        ctrl.categories = categoriesCopy;
        ctrl.originalCats = categoriesCopy;
        ctrl.update();
    });

    $scope.$watchCollection(() => ctrl.usageRights, onValChange(() => {
        ctrl.update();
    }));

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
        }
    };

    ctrl.cancel = () => ctrl.onCancel();

    // stop saving on no/multi rights
    ctrl.savingDisabled = () => {
        return ctrl.saving ||
            angular.equals(ctrl.category, noRights) || angular.equals(ctrl.category, multiRights);
    };

    ctrl.getOptionsFor = property => {
        const key = ctrl.category
                        .properties
                        .find(prop => prop.name === property.optionsMapKey)
                        .name;

        const val = ctrl.model[key];
        return property.optionsMap[val] || [];
    };

    ctrl.isOtherValue = property => {
        if (!ctrl.model[property.name]) {
            // if we haven't set a value, it won't be in the list of available values,
            // but this isn't considered "other", it's "not set".
            return false;
        } else {
            const missingVal =
                !ctrl.getOptionsFor(property)
                    .find(option => option === ctrl.model[property.name]);

            return missingVal;
        }
    };

    ctrl.isRestricted = prop => ctrl.showRestrictions || prop.required;

    $scope.$watch(() => ctrl.showRestrictions, onValChange(isRestricted => {
        if (!isRestricted) {
            delete ctrl.model.restrictions;
        }
    }));

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

    function save(data) {
        ctrl.error = null;
        ctrl.saving = true;
        $q.all(ctrl.usageRights.map((usageRights) => {
            const image = usageRights.image;
            const resource = image.data.userMetadata.data.usageRights;
            return editsService.update(resource, data, image).
                then(resource => resource.data);
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
        // ♫ Very superstitious ♫
        ctrl.error = error && error.body && error.body.errorMessage ||
            'Unexpected error';
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
