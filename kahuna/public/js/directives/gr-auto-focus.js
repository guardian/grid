import angular from 'angular';

export var autoFocus = angular.module('gr.autoFocus', []);

autoFocus.directive('grAutoFocus', ['$timeout',
    function ($timeout){

        return {
            restrict: 'A',
            link: function(scope, element){
                $timeout(function(){
                    element[0].focus();
                });

            }
        };

    }
]);
