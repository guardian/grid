import angular from 'angular';
import 'angular-elastic';

import Rx from 'rx';
import '../util/rx';

import {List} from 'immutable';

import '../services/image-list';

import template from './usage-rights-editor.html';
import './usage-rights-editor.css';

import '../components/gr-confirm-delete/gr-confirm-delete.js';
import { trackAll } from '../util/batch-tracking';

export var usageRightsEditor = angular.module('kahuna.edits.usageRightsEditor', [
    'monospaced.elastic',
    'gr.confirmDelete',
    'util.rx',
    'kahuna.services.image-list'
]);

usageRightsEditor.controller(
    'UsageRightsEditorCtrl',
    ['$q', '$rootScope', '$scope', 'inject$', 'observe$', 'editsService', 'editsApi', 'imageList',
    function($q, $rootScope, $scope, inject$, observe$, editsService, editsApi, imageList) {

    var ctrl = this;
    const multiCat = { name: 'Multiple categories', value: 'multi-cat', properties: [] };

    ctrl.usageRightsHelpLink = window._clientConfig.usageRightsHelpLink;

    // @return Stream.<Array.<UsageRights>>
    const usageRights$ = observe$($scope, () => ctrl.usageRights);

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
    // FIXME: This is not longer the canonical category as we aren't taking the user interaction
    // into account so this goes stale.
    const category$ = usageRights$.combineLatest(categories$, (urs, cats) => {
        const uniqueCats = getUniqueCats(urs);
        if (uniqueCats.length === 1) {
            const uniqeCat = uniqueCats[0] || '';
            return cats.find(cat => cat.value === uniqeCat);
        } else {
            return multiCat;
        }
    });

    // @return Stream.<Category>
    // The filter is used here to stop the initial setting of `undefined` being published.
    const categoryFromUserChange$ = observe$($scope, () => ctrl.category).filter(cat => !!cat);

    const categoryInvalid$ = categoryFromUserChange$.map((c) => c.value === '');

    // @return Stream.<Category>
    const categoryWithUserChange$ =
        category$.merge(categoryFromUserChange$).distinctUntilChanged();

    const model$ = usageRights$.map(urs => {
        const usageRightsData = (urs.map(ur => ur.data));

        // Get a Map(property, Set(values));
        const objs = imageList.getSetOfProperties(new List(usageRightsData));

        // Return an object with the value, iif there is 1 value
        return objs.filter(obj => obj.size === 1).map(obj => obj.first()).toJS();
    });

    // Stream.<Boolean>
    const savingDisabled$ = categoryWithUserChange$.map(cat => cat === multiCat);

    // Stream.<Boolean>
    const forceRestrictions$ = model$.combineLatest(categoryWithUserChange$, (model, cat) => {
        const defaultRestrictions =
            cat.properties.find(prop => prop.name === 'defaultRestrictions');
        const restrictedProp =
            cat.properties.find(prop => prop.name === 'restrictions');

        return defaultRestrictions || (restrictedProp && restrictedProp.required);
    });

    // Stream.<Boolean>
    const modelHasRestrictions$ = model$.map(model => angular.isDefined(model.restrictions));

    // Stream.<Boolean>
    const showRestrictions$ = forceRestrictions$.combineLatest(modelHasRestrictions$,
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
    inject$($scope, categoryInvalid$, ctrl, 'categoryInvalid');

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

        // unchecking restrictions will remove restriction on save
        if (! ctrl.showRestrictions && data.restrictions) {
            delete data.restrictions;
        }

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
      return trackAll($rootScope, "rights", ctrl.usageRights, [
        ({ image }) => {
          const resource = image.data.userMetadata.data.usageRights;
          return editsService.update(resource, data, image, true);
        },
        ({ image }) => setMetadataFromUsageRights(image, true),
        ({ image }) => image.get()
      ],'images-updated');
    }

    function saveComplete() {
        ctrl.onSave();
        ctrl.saving = false;
    }

    function getUniqueCats(usageRights) {
        return unique(usageRights.map(ur => ur.data.category));
    }

    function unique(arr) {
        return arr.reduce((prev, curr) =>
            prev.indexOf(curr) !== -1 ? prev : prev.concat(curr), []);
    }

    function uiError(error) {
        // ♫ Very superstitious ♫
        ctrl.error = error && error.body && error.body.errorMessage ||
            'Unexpected error';
    }

    // HACK: This should probably live somewhere else, but it's the least intrusive
    // here. This updates the metadata based on the usage rights to stop users having
    // to enter content twice.
    // ALSO: inBatch determines whether the function chain should eventually emit an angular message
    // as emitting multiple times is very performance heavy
    // ideally this should be refactored out.
    function setMetadataFromUsageRights(image, inBatch = false) {
        return editsService.updateMetadataFromUsageRights(image, inBatch);
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
