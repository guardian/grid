import angular from 'angular';
import template from './required-metadata-editor.html!text';
import '../../forms/datalist';

export var jobs = angular.module('kahuna.upload.jobs.requiredMetadataEditor', [
    'kahuna.forms.datalist'
]);


jobs.controller('RequiredMetadataEditorCtrl',
                ['$scope', '$window', 'mediaApi',
                 function($scope, $window, mediaApi) {

    var ctrl = this;

    ctrl.saving = false;
    ctrl.disabled = () => Boolean(ctrl.saving || ctrl.externallyDisabled);

    ctrl.save = function() {
        ctrl.saving = true;

        // FIXME: I'm not really sure what we should be doing here. If we send
        // over "" should we be:
        // * overriding the original metadata with ""
        // * clearing the override and falling back to the original
        var cleanMetadata = {};
        Object.keys(ctrl.metadata).forEach(key => {
            if (ctrl.metadata[key]) {
                cleanMetadata[key] = ctrl.metadata[key];
            }
        });

        ctrl.resource.put({ data: cleanMetadata })
            .then(resource => {
                ctrl.resource = resource;
                $scope.jobEditor.$setPristine();
            })
            .catch(() => $window.alert('Failed to save the changes, please try again.'))
            .finally(() => ctrl.saving = false);
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
            externallyDisabled: '=?disabled'
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

