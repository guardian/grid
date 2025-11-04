import angular from 'angular';
import './gr-more-like-this.css';
import template from './gr-more-like-this.html';

export const moreLikeThis = angular.module('gr.moreLikeThis', []);

moreLikeThis.controller('MoreLikeThisCtrl', [
  '$scope',

  function Controller($scope) {

    let ctrl = this;

    ctrl.$onInit = () => {
      ctrl.getMoreLikeThisQuery = function() {
        return `similar:${ctrl.image.data.id}`;
      }
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

