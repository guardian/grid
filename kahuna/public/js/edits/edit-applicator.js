import angular from 'angular';
import template from './edit-applicator.html!text';

export var editApplicator = angular.module('kahuna.edits.editApplicator', []);

editApplicator.controller('EditApplicatorCtrl', function() {

    this.applyEdits = () => {
        this.toThese().forEach(resource => {
            resource
                .post({ data: this.giveThis() })
                .then(this.andThen());
        });
    };

});

editApplicator.directive('uiEditApplicator', function() {
    return {
        restrict: 'E',
        // we use a function binding here for performance
        // we land up with a "iterations reached" reached error otherwise
        // see: https://docs.angularjs.org/error/$rootScope/infdig
        scope: {
            giveThis: '&',
            toThese: '&',
            andThen: '&'
        },
        bindToController: true,
        controller: 'EditApplicatorCtrl as editApplicator',
        link: function(scope, element, attrs, ctrl) {
            element.on('click', ctrl.applyEdits);
        },
        template: template
    }
});
