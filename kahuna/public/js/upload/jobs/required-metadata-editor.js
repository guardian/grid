import angular from 'angular';
import template from './required-metadata-editor.html!text';

import '../../edits/service';
import '../../forms/datalist';

export var jobs = angular.module('kahuna.upload.jobs.requiredMetadataEditor', [
    'kahuna.edits.service',
    'kahuna.forms.datalist'
]);


jobs.controller('RequiredMetadataEditorCtrl',
                ['$scope', '$window', 'mediaApi', 'editsService',
                 function($scope, $window, mediaApi, editsService) {

    var ctrl = this;

    ctrl.saving = false;
    ctrl.disabled = () => Boolean(ctrl.saving || ctrl.externallyDisabled);

    ctrl.save = function() {
        ctrl.saving = true;

        // If there has been a change in the metadata, save it as an override
        var cleanMetadata = {};
        Object.keys(ctrl.metadata).forEach(key => {
            if (ctrl.metadata[key] !== ctrl.originalMetadata[key]) {
                cleanMetadata[key] = ctrl.metadata[key];
            }
        });

        editsService.
            update(ctrl.resource, cleanMetadata, ctrl.image).
            then(resource => {
                ctrl.resource = resource;
                $scope.jobEditor.$setPristine();
            }).
            catch(() => $window.alert('Failed to save the changes, please try again.')).
            finally(() => ctrl.saving = false);
    };

    ctrl.metadataSearch = (field, q) => {
        return mediaApi.metadataSearch(field,  { q }).then(resource => {
            return resource.data.map(d => d.key);
        });
    };

    $scope.$watch(() => ctrl.originalMetadata, () => {
        setMetadataFromOriginal();
    });

    function setMetadataFromOriginal() {
        // we only want a subset of the data
        ctrl.metadata = {
            byline: ctrl.originalMetadata.byline,
            credit: ctrl.originalMetadata.credit,
            description: ctrl.originalMetadata.description
        };
    }
}]);

jobs.directive('uiRequiredMetadataEditor', [function() {
    return {
        restrict: 'E',
        scope: {
            resource: '=',
            originalMetadata: '=metadata',
            externallyDisabled: '=?disabled',
            // TODO: remove this once we add links to the resources
            image: '='
        },
        controller: 'RequiredMetadataEditorCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);

jobs.controller('DescriptionPlaceholderCtrl',
                ['$scope',
                 function($scope) {

    var people = [
        'George Osborne',
        'A teary Nick Clegg',
        'Pop singer Rihanna',
        'US actress and director Angelina Jolie',
        'George W. Bush'
    ];

    var actions = [
        'eating',
        'caught with',
        'wrestling',
        'chants while marching for a third night of protests about',
        'making a toast to'
    ];

    var things = [
        'a large pheasant burger',
        'two human-sized rubber ducks',
        'a proposal for a new Union Jack',
        'the recently passed Owning The Internet bill',
        'the first crewed spaceship to reach Mars',
        'the largest ever koala recorded in history'
    ];

    function random(array) {
        var index = Math.floor(Math.random() * array.length);
        return array[index];
    }

    $scope.funnyDescription = [people, actions, things].map(random).join(' ');

}]);

