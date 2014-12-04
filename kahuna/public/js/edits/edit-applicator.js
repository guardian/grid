import angular from 'angular';
import template from './edit-applicator.html!text';

export var editApplicator = angular.module('kahuna.edits.editApplicator', []);

editApplicator.controller('EditApplicatorCtrl', function() {

});

editApplicator.directive('uiEditApplicator', function() {
    return {
        restrict: 'E',
        // we use a function binding here for performance
        // we land up with a "iterations reached" reached error otherwise
        // see: https://docs.angularjs.org/error/$rootScope/infdig
        scope: {
            giveThis: '&',
            toThese: '&'
        },
        link: function(scope, element) {
            element.on('click', e => {
                scope.toThese().forEach(resource => {
                    resource
                        .post({ data: scope.giveThis() });
                });
            });
        },
        template: template
    }
});
