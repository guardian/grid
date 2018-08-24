import angular from 'angular';

import template from './gr-description-warning.html';
import './gr-description-warning.css';

export const grDescription = angular.module('gr.descriptionWarning', []);

const MIN_LENGTH = 30;
const MIN_WORDS = 5;

grDescription.directive('grDescriptionWarning', [function () {
    return {
        restrict: 'E',
        template: template,
        scope: {
            description: '='
        },
        link: function($scope) {
            $scope.$watch('description', value => {
                if (value) {
                    const wordCount = value.split(' ').length;
                    $scope.showWarning = value.length < MIN_LENGTH || wordCount < MIN_WORDS;
                } else {
                    $scope.showWarning = true;
                }
            });
        }
    };
}]);
