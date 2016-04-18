import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';

import '../../util/rx';
import '../../util/seq';

export var lazyGallery = angular.module('gu.lazyGallery', [
    'util.rx',
    'util.seq'
]);

lazyGallery.controller('GuLazyGalleryCtrl', [function() {
    let ctrl = this;
}]);

lazyGallery.directive('guLazyGallery', [function() {
    return {
        restrict: 'A',
        controller: 'GuLazyGalleryCtrl',
        link: function() {
            console.log("Gallery");
        }
    }
}]);
