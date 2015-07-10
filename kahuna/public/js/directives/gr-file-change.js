import angular from 'angular';

export var fileChange = angular.module('gr.fileChange', []);

fileChange.directive('grFileChange', ['$parse', function($parse) {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            element.on('change', function() {
                const onchange = $parse(attrs.grFileChange)(scope);
                onchange(Array.from(element[0].files));
            });
        }
    };
}]);
