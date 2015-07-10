import angular from 'angular';

export var fileChange = angular.module('gr.fileChange', []);

fileChange.directive('grFileChange', ['$parse', function($parse) {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            element.on('change', function() {
                scope.$eval(attrs.grFileChange, {
                    $files: Array.from(element[0].files)
                });
            });
        }
    };
}]);
