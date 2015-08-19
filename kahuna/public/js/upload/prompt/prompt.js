import angular from 'angular';

import './prompt.css!';
import template from './prompt.html!text';

export let prompt = angular.module('kahuna.upload.prompt', [

]);

prompt.directive('filePrompt', [function () {
    return {
        restrict: 'E',
        transclude: 'replace',
        template: template
    }
}]);
