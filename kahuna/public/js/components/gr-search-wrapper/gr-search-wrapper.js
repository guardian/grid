import angular from 'angular';
import '../../search/query';
import template from './gr-search-wrapper.html';
import './gr-search-wrapper.css';

export var grSearchWrapper = angular.module('gr-searchWrapper', ['kahuna.search.query']);

grSearchWrapper.directive('grSearchWrapper', [function() {
  return {
    replace: true,
    template: template
  };
}]);
