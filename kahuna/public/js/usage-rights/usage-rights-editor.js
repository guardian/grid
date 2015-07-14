import angular from 'angular';
import 'angular-elastic';
import template from './usage-rights-editor.html!text';
import './usage-rights-editor.css!';

export var usageRightsEditor = angular.module('kahuna.edits.usageRightsEditor', [
    'monospaced.elastic'
]);

usageRightsEditor.controller(
    'UsageRightsEditorCtrl',
    ['$q', '$scope', '$window', '$timeout', 'editsService', 'editsApi',
    function($q, $scope, $window, $timeout, editsService, editsApi) {

    var ctrl = this;

    ctrl.resetCategory = () => ctrl.category = {}
    ctrl.setCategory = function(c) {
        ctrl.category = ctrl.categories.find(cat => cat.value === c);
    }

    var getResource = (image) => image.data.userMetadata.data.usageRights;

    ctrl.updateFromImages = function() {
        if(ctrl.images.length == 1) {
            ctrl.setCategory(ctrl.images[0].data.usageRights.category)
            ctrl.model = angular.extend({}, ctrl.images[0].data.usageRights)
        } else {
            ctrl.resetCategory();
            ctrl.resetModel();
        }
    }

    $scope.$on('usage-rights:update-images', function (e, images) {
        ctrl.images = images;
        ctrl.updateFromImages();
    });

    // setting our initial values
    editsApi.getUsageRightsCategories().then((cats) => {
        ctrl.categories = cats;

        ctrl.updateFromImages();
    });

    ctrl.saving = false;
    ctrl.saved = false;
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

    ctrl.isNotEmpty = () => !angular.equals(ctrl.model, {});

    ctrl.pluraliseCategory = () => ctrl.category.name +
        (ctrl.category.name.toLowerCase().endsWith('image') ? 's' : ' images');

    ctrl.restrictionsPlaceholder = () => ctrl.getCost() === 'conditional' ?
        'e.g. Use in relation to the Windsor Triathlon only' :
        'Adding restrictions will mark this image as restricted. ' +
        'Leave blank if there aren\'t any.';

    ctrl.descriptionPlaceholder = "Remove all restrictions on the use of this image."

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
        ctrl.images.forEach((image) => {
            editsService.remove(getResource(image), image).
                then(resource => {
                    ctrl.onSave();
                    uiSaved();
                }).
                catch(uiError).
                finally(() => ctrl.saving = false);
        });
    }

    function save(data) {
        ctrl.saving = true;
        var a = ctrl.images.map((image) => {
            return editsService.
                update(getResource(image), data, image).
                then(resource => {

                    // Cost is a calulated field so we must retrieve it
                    return image.get().then((newImage) => {
                        image.data.cost = newImage.data.cost;
                        image.data.usageRights = newImage.data.usageRights;
                    });

                });
        });

        $q.all(a).
            catch(uiError).
            finally(() => {
                ctrl.onSave();
                uiSaved();
                ctrl.saving = false
            });
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
            images: '=grImages',
            onSave: '&?grOnSave'
        }
    };
}]);
