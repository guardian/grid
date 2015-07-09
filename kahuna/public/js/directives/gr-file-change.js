import angular from 'angular';

export var fileChange = angular.module('gr.fileChange', []);

fileChange.directive('grFileChange', function() {
    return {
        restrict: 'A',
        scope: {
            onchange: '&grFileChange'
        },
        link: function(scope, element) {
            element.on('change', function() {
                // TODO: no function reference
                scope.onchange()(Array.from(element[0].files));
            });
        }
    };
});
