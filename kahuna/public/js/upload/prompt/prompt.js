import angular from 'angular';

import './prompt.css';
import template from './prompt.html';
import '../../components/gr-preset-labels/gr-preset-labels';

import strings from '../../strings.json';

export let prompt = angular.module('kahuna.upload.prompt', [
    'gr.presetLabels'
]);

prompt.directive('filePrompt', [function () {
    return {
        restrict: 'E',
        transclude: 'replace',
        scope: {}, // ensure isolated scope
        template: template,
        link: function($scope) {
            $scope.systemName = window._clientConfig.systemName;
            $scope.exampleLabel = strings.exampleLabel;
        }
    };
}]);
