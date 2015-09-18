import angular from 'angular';
import 'angular-elastic';

import template from './usage-rights-editor.html!text';
import './usage-rights-editor.css!';

import '../components/gr-confirm-delete/gr-confirm-delete.js';


import Rx from 'rx';
import '../util/rx';

export var usageRightsEditor = angular.module('kahuna.edits.usageRightsEditor', [
    'monospaced.elastic',
    'gr.confirmDelete',
    'util.rx'
]);

usageRightsEditor.controller(
    'UsageRightsEditorCtrl',
    ['$q', '$scope', '$window', '$timeout', 'editsService', 'editsApi', 'onValChange', 'inject$',
    function($q, $scope, $window, $timeout, editsService, editsApi, onValChange, inject$) {

    var ctrl = this;
    const multiCat = { name: 'Multiple categories', value: 'multi-cat' };

    const usageRights$ = new Rx.BehaviorSubject([]);
    $scope.$watch(() => ctrl.usageRights, usageRightsList => {
        // poor mans stream updating
        usageRights$.onNext(usageRightsList);
    });

    const categories$ = Rx.Observable.fromPromise(editsApi.getUsageRightsCategories());

    const displayCategories$ = usageRights$.combineLatest(categories$, (urs, cats) => {
        const uniqueCats = getUniqueCats(urs);
        if (uniqueCats.length === 1) {
            return cats;
        } else {
            return [multiCat].concat(cats);
        }
    });

    const category$ = usageRights$.combineLatest(categories$, (urs, cats) => {
        const uniqueCats = getUniqueCats(urs);
        if (uniqueCats.length === 1) {
            const uniqeCat = uniqueCats[0] || '';
            return cats.find(cat => cat.value === uniqeCat);
        } else {
            return multiCat;
        }
    });

    const model$ = usageRights$.map(urs => {
        const multiModel = reduceObjectsToArrays(urs.map(ur => ur.data));
        return Object.keys(multiModel).reduce((model, key) => {
            if (unique(multiModel[key]).length === 1) {
                model[key] = multiModel[key][0];
            }
            return model;
        }, {});
    });

    const savingDisabled$ = category$.map(cat => cat === multiCat);

    inject$($scope, displayCategories$, ctrl, 'categories');
    inject$($scope, category$, ctrl, 'category');
    inject$($scope, model$, ctrl, 'model');
    inject$($scope, savingDisabled$, ctrl, 'savingDisabled');


    ctrl.getOptionsFor = property => {
        const options = property.options.map(option => ({ key: option, value: option }));
        if (property.required) {
            return options;
        } else {
            return [{key: 'None', value: null}].concat(options);
        }
    };

    ctrl.save = () => {
        // we save as `{}` if category isn't defined.
        const data = ctrl.category.value ?
            angular.extend({}, ctrl.model, { category: ctrl.category.value }) : {};
        save(data)
    };

    ctrl.reset = () => {
        ctrl.model = {};
    };




    function save(data) {
        $q.all(ctrl.usageRights.map((usageRights) => {
            const image = usageRights.image;
            const resource = image.data.userMetadata.data.usageRights;
            return editsService.update(resource, data, image).
                then(resource => resource.data);
        })).catch(uiError).
            finally(() => updateSuccess(data));
    }

    function getUniqueCats(usageRights) {
        return unique(usageRights.map(ur => ur.data.category));
    }

    function unique(arr) {
        return arr.reduce((prev, curr) =>
            prev.indexOf(curr) !== -1 ? prev : prev.concat([curr]), []);
    }

    // takes an array of objects and turns it into an object with an array of unique values
    // e.g. [{ a: 1, b: 2 }, { a: 2, b: 2, c: 3 }] => { a: [1,2], b: [2], c: [3] }
    function reduceObjectsToArrays(objects) {
        // find a list of available keys
        const keys = unique(objects.reduce((keys, obj) => {
            return Object.keys(obj).concat(keys);
        }, []));

        const objOfArrays = objects.reduce((objOfArrays, obj) => {
            keys.forEach(key => {
                const val = [obj[key]];
                objOfArrays[key] = objOfArrays[key] ? objOfArrays[key].concat(val) : val;
            });

            return objOfArrays;
        }, {});

        return objOfArrays;
    }



    return;

    var ctrl = this;

    ctrl.saving = false;
    ctrl.saved = false;
    ctrl.categories = [];
    ctrl.originalCats = [];
    ctrl.model = angular.extend({}, ctrl.usageRights.data);

    const multiRights = { name: 'Multiple categories', value: '', description: '' };
    const catsWithMultiRights = () => [multiRights].concat(ctrl.originalCats);
    const setStandardCats = () => ctrl.categories = ctrl.originalCats;
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
        // what's going on.
        if (!ctrl.category && ctrl.usageRights.length > 1) {
            setMultiRightsCats();
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
        const data = modelToData(ctrl.model);
        save(data);
    };

    ctrl.cancel = () => ctrl.onCancel();

    // stop saving on no/multi rights
    ctrl.savingDisabled = () => {
        return ctrl.saving || angular.equals(ctrl.category, multiRights);
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

    ctrl.isRestricted = prop =>
        ctrl.showRestrictions || ctrl.category.defaultRestrictions || prop.required;

    $scope.$watch(() => ctrl.showRestrictions, onValChange(isRestricted => {
        if (!isRestricted) {
            delete ctrl.model.restrictions;
        }
    }));

    function setCategory(val) {
        ctrl.category = ctrl.categories.find(cat => cat.value === val);
    }

    function modelToData(model) {
        if (ctrl.category.value === '') {
            return {};
        } else {
            return angular.extend({}, model, { category: ctrl.category && ctrl.category.value });
        }
    }

    //function save(data) {
    //    ctrl.error = null;
    //    ctrl.saving = true;
    //    $q.all(ctrl.usageRights.map((usageRights) => {
    //        const image = usageRights.image;
    //        const resource = image.data.userMetadata.data.usageRights;
    //        return editsService.update(resource, data, image).
    //            then(resource => resource.data);
    //    })).catch(uiError).
    //        finally(() => updateSuccess(data));
    //}

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
