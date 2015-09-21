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
    ['$q', '$scope', '$window', '$timeout', 'editsService', 'editsApi', 'onValChange', 'inject$', 'observe$',
    function($q, $scope, $window, $timeout, editsService, editsApi, onValChange, inject$, observe$) {

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

    // I haven't combined these as it seems unnecessary as we only need to change to `multiCat`
    // when the list of usageRights is updated.
    const categoryChange$ = observe$($scope, () => ctrl.category, (a,b,c,d) => { console.log(a,b,c,d) });
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

    const savingDisabled$ = category$.combineLatest(categoryChange$, cat => cat === multiCat);

    inject$($scope, displayCategories$, ctrl, 'categories');
    inject$($scope, category$, ctrl, 'category');
    inject$($scope, model$, ctrl, 'model');
    inject$($scope, savingDisabled$, ctrl, 'savingDisabled');

    // TODO: Some of these, especially `isRestricted` could be streams
    ctrl.saving = false;
    ctrl.getOptionsFor = property => {
        const options = property.options.map(option => ({ key: option, value: option }));
        if (property.required) {
            return options;
        } else {
            return [{key: 'None', value: null}].concat(options);
        }
    };

    ctrl.save = () => {
        ctrl.saving = true;
        // we save as `{}` if category isn't defined.
        const data = ctrl.category.value ?
            angular.extend({}, ctrl.model, { category: ctrl.category.value }) : {};

        save(data).
        catch(uiError).
        finally(() => ctrl.saving = false);
    };

    ctrl.reset = () => {
        ctrl.model = {};
    };

    ctrl.isRestricted = prop =>
        ctrl.showRestrictions || ctrl.category.defaultRestrictions || prop.required;

    function save(data) {
        return $q.all(ctrl.usageRights.map(usageRights => {
            const image = usageRights.image;
            const resource = image.data.userMetadata.data.usageRights;
            return editsService.update(resource, data, image).
                then(resource => resource.data);
        }));
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
