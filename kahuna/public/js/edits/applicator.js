import angular from 'angular';
import template from './applicator.html!text';

export var applicator = angular.module('kahuna.edits.applicator', []);

applicator.controller('ApplicatorCtrl', [function() {
    var ctrl = this;

    ctrl.go = function() {
        // FIXME: a better way to do this?
        // this is to avoid sending null values
        var metadata = {
            description: ctrl.description,
            byline: ctrl.byline,
            credit: ctrl.credit
        };
        var cleanMetadata = {};
        var updateFields = Object.keys(metadata).filter(key => metadata[key]);

        updateFields.forEach(key => cleanMetadata[key] = metadata[key]);
        
        if (updateFields.length > 0) {
            ctrl.applyTo().forEach(resource => {
                resource.data.metadata.put({ data: cleanMetadata }).response.then(() => {
                    ctrl.onUpdate({ metadata: cleanMetadata });
                });
            });
        }
    };
}]);

applicator.directive('uiApplicator', function() {
    return {
        restrict: 'E',
        scope: {
            // this is a func ref or we land up hitting too many iterations:
            // https://docs.angularjs.org/error/$rootScope/infdig
            applyTo: '&',
            onUpdate: '&'
        },
        template: template,
        bindToController: true,
        controller: 'ApplicatorCtrl',
        controllerAs: 'ctrl'
    }
});
