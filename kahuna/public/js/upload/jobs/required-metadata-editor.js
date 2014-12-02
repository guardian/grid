import angular from 'angular';
import template from './required-metadata-editor.html!text';

export var jobs = angular.module('kahuna.upload.jobs.requiredMetadataEditor', []);


jobs.controller('RequiredMetadataEditorCtrl',
                ['$scope', '$window',
                 function($scope, $window) {

    var ctrl = this;

    ctrl.description = $scope.initial.description;
    ctrl.byline      = $scope.initial.byline;
    ctrl.credit      = $scope.initial.credit;

    ctrl.saving = false;

    ctrl.save = function() {
        ctrl.saving = true;
        var metadata = {
            description: ctrl.description,
            byline:      ctrl.byline,
            credit:      ctrl.credit
        };
        var updatedResource = $scope.overrideResource.put({
            // TODO: dispose of boilerplate, just send data as entity
            data: metadata
        });
        // FIXME: this is really a hack; should put() return a Promise?
        updatedResource.response.
            then(() => {
                $scope.jobEditor.$setPristine();
                $scope.onUpdate({metadata: metadata});
            }).
            catch(() => {
                $window.alert('Failed to save the changes, please try again.');
            }).
            finally(() => {
                ctrl.saving = false;
            });
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
            // Annoying that we can't make a uni-directional binding
            // as we don't really want to modify the original
            initial: '=',
            overrideResource: '=',
            onUpdate: '&'
        },
        controller: 'RequiredMetadataEditorCtrl as editorCtrl',
        template: template
    };
}]);
