import angular from 'angular';
import template from './applicator.html!text';

export var applicator = angular.module('kahuna.edits.applicator', []);

applicator.controller('ApplicatorCtrl', [function() {

}]);

applicator.directive('uiApplicator', function() {
    return {
        restrict: 'E',
        scope: {
            applyTo: '='
        },
        bindToController: true,
        template: template,
        controller: 'ApplicatorCtrl as ctrl'
    }
});
