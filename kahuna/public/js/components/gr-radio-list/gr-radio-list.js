import angular from 'angular';

import './gr-radio-list.css';
import template from './gr-radio-list.html';

export const radioList = angular.module('gr.radioList', []);

radioList.directive('grRadioList', [function () {
  return {
    restrict: 'E',
    template,
    scope: {
      listFor: '@grFor',
      options: '=grOptions',
      selection: '=grSelectedOption'
    }
  };
}]);
