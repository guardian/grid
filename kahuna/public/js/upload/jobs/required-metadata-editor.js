import angular from 'angular';

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


jobs.directive('uiRequiredMetadataEditor', ['jsDirectory', function(jsDirectory) {
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
        templateUrl: jsDirectory + '/upload/jobs/required-metadata-editor.html'
    };
}]);
