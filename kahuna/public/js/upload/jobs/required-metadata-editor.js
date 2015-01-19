import angular from 'angular';
import template from './required-metadata-editor.html!text';

export var jobs = angular.module('kahuna.upload.jobs.requiredMetadataEditor', []);


jobs.controller('RequiredMetadataEditorCtrl',
                ['$scope', '$window', 'editsApi',
                 function($scope, $window, editsApi) {

    var ctrl = this;

    ctrl.busy = ctrl.busy === true;

    // we only want a subset of the data
    ctrl.metadata = {
        byline: ctrl.originalMetadata.byline,
        credit: ctrl.originalMetadata.credit,
        description: ctrl.originalMetadata.description
    };

    ctrl.save = function() {
        ctrl.busy = true;

        editsApi.updateMetadata(ctrl.id, ctrl.metadata)
            .then(() => $scope.jobEditor.$setPristine())
            .catch(() => $window.alert('Failed to save the changes, please try again.'))
            .finally(() => ctrl.busy = false);
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


jobs.directive('uiRequiredMetadataEditor', [function() {
    return {
        restrict: 'E',
        scope: {
            id: '=',
            originalMetadata: '=metadata', // [1]
            busy: '=?'
        },
        controller: 'RequiredMetadataEditorCtrl as ctrl',
        template: template,
        bindToController: true
    };
}]);
