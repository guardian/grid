import angular from 'angular';
import './gr-more-like-this.css';
import template from './gr-more-like-this.html';
import {getFeatureSwitchActive} from '../gr-feature-switch-panel/gr-feature-switch-panel';

export const moreLikeThis = angular.module('gr.moreLikeThis', []);

moreLikeThis.controller('MoreLikeThisCtrl', [
  '$scope',

  function Controller() {

    let ctrl = this;

    ctrl.$onInit = () => {
      ctrl.showMoreLikeThis = getFeatureSwitchActive('enable-ai-search');
      ctrl.getMoreLikeThisQuery = function() {
        return `similar:${ctrl.image.data.id}`;
      };
    };
  }]);

moreLikeThis.directive('grMoreLikeThis', function () {
  return {
    restrict: 'E',
    controller: 'MoreLikeThisCtrl',
    controllerAs: 'ctrl',
    bindToController: true,
    scope: {
      image: '=',
      crop: '='
    },
    template: template
  };
});

