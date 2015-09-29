import angular from 'angular';

import './prompt.css!';
import template from './prompt.html!text';
import '../../components/gr-add-preset-label/gr-add-preset-label';
import './preset-labeller';

export let prompt = angular.module('kahuna.upload.prompt', [
    'gr.addPresetLabel',
    'kahuna.upload.prompt.presetLabeller'
]);

prompt.directive('filePrompt', [function () {
    return {
        restrict: 'E',
        transclude: 'replace',
        template: template
    };
}]);
