import angular from 'angular';

import template from './prompt.html!text';
import '../../components/gr-preset-labels/gr-preset-labels';

export let prompt = angular.module('kahuna.upload.prompt', [
    'gr.presetLabels'
]);

prompt.directive('filePrompt', [function () {
    return {
        restrict: 'E',
        transclude: 'replace',
        scope: {}, // ensure isolated scope
        template: template
    };
}]);
