import angular from 'angular';
import 'angular-elastic';
import template from './usage-rights-editor.html!text';
import './usage-rights-editor.css!';

export var usageRightsEditor = angular.module('kahuna.edits.usageRightsEditor', [
    'monospaced.elastic'
]);

usageRightsEditor.controller(
    'UsageRightsEditorCtrl',
    ['$scope', '$window', '$timeout', 'editsService', 'editsApi',
    function($scope, $window, $timeout, editsService, editsApi) {

    var ctrl = this;

    ctrl.resetCategory = () => ctrl.category = {}
    ctrl.setCategory = function(c) {
        ctrl.category = ctrl.categories.find(cat => cat.value === c);
    }

    ctrl.updateFromImages = function(images) {
        ctrl.images = images;

        if(images.length == 1) {
            ctrl.setCategory(images[0].data.usageRights.category)
            ctrl.model = angular.extend({}, images[0].data.usageRights)
        } else {
            ctrl.resetCategory();
            ctrl.resetModel();
        }
    }

    $scope.$on('usage-rights:update-images', function (e, images) {
        ctrl.updateFromImages(images);
    });

    // setting our initial values
    editsApi.getUsageRightsCategories().then((cats) => {
        ctrl.categories = cats;

        ctrl.setCategory(ctrl.resource ? ctrl.resource.data.category : undefined);
        ctrl.model = ctrl.resource ? angular.extend({}, ctrl.resource.data) : undefined;
    });

    ctrl.saving = false;
    ctrl.saved = false;
    ctrl.images = [];
    ctrl.categories = [];

    ctrl.multipleImages = () => ctrl.images.length > 1

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

    ctrl.getOptionsFor = property => {
        const key = ctrl.category.properties.find(prop => prop.name === property.optionsMapKey).name;
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
