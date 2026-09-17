import angular from 'angular';

import './prompt.css';
import '../../components/gr-preset-labels/gr-preset-labels';
import template from './prompt.html';
import strings from '../../strings.json';

export let prompt = angular.module('kahuna.upload.prompt', [
    'gr.presetLabels',
    'kahuna.services.presetLabel'
]);

prompt.directive('filePrompt', ['presetLabelService', function (presetLabelService) {
    return {
        restrict: 'E',
        transclude: 'replace',
        scope: {}, // ensure isolated scope
        template: template,
        link: function($scope) {
            $scope.systemName = window._clientConfig.systemName;
            $scope.exampleLabel = strings.exampleLabel;
            $scope.hasPresetLabels = () => presetLabelService.getLabels().length > 0;
        }
    };
}]);
