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
    ['$q', '$scope', 'inject$', 'observe$', 'editsService', 'editsApi',
    function($q, $scope, inject$, observe$, editsService, editsApi) {

    var ctrl = this;
    const multiCat = { name: 'Multiple categories', value: 'multi-cat', properties: [] };

    // @return Stream.<Array.<UsageRights>>
    const usageRights$ = observe$($scope, () => ctrl.usageRights).startWith([]);

    // @return Stream.<Array.<Category>>
    const categories$ = Rx.Observable.fromPromise(editsApi.getUsageRightsCategories());

    // @return Stream.<Array.<Category>>
    const displayCategories$ = usageRights$.combineLatest(categories$, (urs, cats) => {
        const uniqueCats = getUniqueCats(urs);
        if (uniqueCats.length === 1) {
            return cats;
        } else {
            return [multiCat].concat(cats);
        }
    });

    // @return Stream.<Category>
    const categoryFromUsageRights$ = usageRights$.combineLatest(categories$, (urs, cats) => {
        const uniqueCats = getUniqueCats(urs);
        if (uniqueCats.length === 1) {
            const uniqeCat = uniqueCats[0] || '';
            return cats.find(cat => cat.value === uniqeCat);
        } else {
            return multiCat;
        }
    });

    // @return Stream.<Category>
    const categoryChange$ = observe$($scope, () => ctrl.category).filter(cat => !!cat);

    // @return Stream.<Category>
    const category$ = categoryFromUsageRights$.merge(categoryChange$).distinctUntilChanged();

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
    const forceRestrictions$ = model$.combineLatest(category$, (model, cat) => {
        const defaultRestrictions =
            cat.properties.find(prop => prop.name === 'defaultRestrictions');
        const restrictedProp =
            cat.properties.find(prop => prop.name === 'restrictions');

        return defaultRestrictions || (restrictedProp && restrictedProp.required);
    });

    const userSetShowRestrictions$ = observe$($scope, () => ctrl.showRestrictions);
    const modelHasRestrictions$ = model$.map(model => angular.isDefined(model.restrictions));
    const shouldShowRestrictions$ = userSetShowRestrictions$.merge(modelHasRestrictions$);

    const showRestrictions$ = forceRestrictions$.combineLatest(shouldShowRestrictions$,
        (forceRestrictions, showRestrictions) => {

        if (forceRestrictions) {
            return true;
        } else {
            return showRestrictions;
        }
    });

    inject$($scope, displayCategories$, ctrl, 'categories');
    inject$($scope, category$, ctrl, 'category');
    inject$($scope, model$, ctrl, 'model');
    inject$($scope, savingDisabled$, ctrl, 'savingDisabled');
    inject$($scope, forceRestrictions$, ctrl, 'forceRestrictions');
    inject$($scope, showRestrictions$, ctrl, 'showRestrictions');

    // TODO: Some of these could be streams
    ctrl.saving = false;
    ctrl.getOptionsFor = property => {
        const options = property.options.map(option => ({ key: option, value: option }));
        if (property.required) {
            return options;
        } else {
            return [{key: 'None', value: null}].concat(options);
        }
    };
    ctrl.getOptionsMapFor = property => {
        const key = ctrl.category
                        .properties
                        .find(prop => prop.name === property.optionsMapKey)
                        .name;

        const val = ctrl.model[key];
        return property.optionsMap[val] || [];
    };

    ctrl.save = () => {
        ctrl.saving = true;
        // we save as `{}` if category isn't defined.
        const data = ctrl.category.value ?
            angular.extend({}, ctrl.model, { category: ctrl.category.value }) : {};

        save(data).
        catch(uiError).
        finally(saveComplete);
    };

    ctrl.reset = () => {
        ctrl.model = {};
        ctrl.showRestrictions = undefined;
    };

    ctrl.cancel = () => ctrl.onCancel();

    function save(data) {
        return $q.all(ctrl.usageRights.map(usageRights => {
            const image = usageRights.image;
            const resource = image.data.userMetadata.data.usageRights;
            return editsService.update(resource, data, image).
                then(resource => resource.data);
        }));
    }

    function saveComplete() {
        ctrl.onSave();
        ctrl.saving = false
    }

    function getUniqueCats(usageRights) {
        return unique(usageRights.map(ur => ur.data.category));
    }

    function unique(arr) {
        return arr.reduce((prev, curr) =>
            prev.indexOf(curr) !== -1 ? prev : prev.concat(curr), []);
    }

    // takes an array of objects and turns it into an object with an array of unique values
    // e.g. [{ a: 1, b: 2 }, { a: 2, b: 2, c: 3 }] => { a: [1,2], b: [2], c: [3] }
    // TODO: Use the nicer, immutable `imageList.getSetOfProperties`
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
