import angular from 'angular';
import 'angular-elastic';
import template from './usage-rights-editor.html!text';

export var usageRightsEditor = angular.module('kahuna.edits.usageRightsEditor', [
    'monospaced.elastic'
]);

usageRightsEditor.controller('UsageRightsEditorCtrl',
                             ['$window', '$timeout', 'editsService',
                              function($window, $timeout, editsService) {

    var ctrl = this;
    ctrl.saving = false;
    ctrl.saved = false;
    ctrl.category = ctrl.resource.data.category;
    ctrl.restrictions = ctrl.resource.data.restrictions;
    ctrl.categories = [
        category('PR Image', 'PR Image'),
        category('Handout', 'handout'),
        category('Screengrab', 'screengrab')
    ];

    updateResource(ctrl.resource);

    ctrl.save = () => {
        if (ctrl.category) {
            save(modelToData());
        } else {
            del();
        }
    };
    ctrl.isDisabled = () => ctrl.saving;
    ctrl.isNotEmpty = () => !angular.equals(ctrl.resource.data, {});

    ctrl.getCost = () => getCost(ctrl.category);

    function modelToData() {
        const cost = getCost(ctrl.category);

        if (cost === 'free') {
            return { category: ctrl.category };

        } else if (cost === 'conditional') {
            return {
                category: ctrl.category,
                restrictions: ctrl.restrictions,
                // TODO: remove cost here once it's deprecated from the API
                cost
            };
        }
    }

    function getCost(cat) {
        if (isFree(cat)) {
            return 'free';
        } else if (isRestricted(cat)) {
            return 'conditional';
        }
    }

    function isFree(cat) {
        return contains(['handout', 'screengrab'], cat);
    }

    function isRestricted(cat) {
        return contains(['PR Image'], cat);
    }

    // I can't believe there is no helper for this
    function contains(arr, val) {
        return arr.indexOf(val) !== -1;
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

    function uiError() {
        $window.alert('Failed to save the changes, please try again.');
    }

    function category(name, value) {
        return { name, value };
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
            resource: '=grUsageRights',
            image: '=grImage',
            onSave: '&?grOnSave'
        }
    };
}]);
