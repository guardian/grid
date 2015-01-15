import angular from 'angular';
import template from './applicator.html!text';

export var applicator = angular.module('kahuna.edits.applicator', []);

applicator.controller('ApplicatorCtrl', [function() {
    var ctrl = this;

    ctrl.go = function() {
        ctrl.applyTo().forEach(resource => {
            var data = {
                description: ctrl.description,
                byline: ctrl.byline,
                credit: ctrl.credit
            };
            resource.data.metadata.put({ data: data }).response.then(r => {
                ctrl.onUpdate({ metadata: data });
            });
        });
    };
}]);

applicator.directive('uiApplicator', function() {
    return {
        restrict: 'E',
        scope: {
            applyTo: '=',
            onUpdate: '&'
        },
        bindToController: true,
        template: template,
        controller: 'ApplicatorCtrl as ctrl'
    }
});
