import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';

import '../../util/rx';
import '../../util/seq';

export var lazyGallery = angular.module('gu.lazyGallery', [
    'util.rx',
    'util.seq'
]);

lazyGallery.controller('GuLazyGalleryCtrl', ['$scope', function($scope) {
    let ctrl = this,
        pos = 0;

    function setTransform() {
        $scope.gallery[0].style.transform = 'translate3d(' + (-pos * $scope.gallery[0].offsetWidth) + 'px,0,0)';
    }

    ctrl.previousItem = function() {
        console.log("PREV");
        pos = Math.max(pos - 1, 0);
        setTransform();
    };

    ctrl.nextItem = function() {
        console.log("NEXT");
        pos = Math.min(pos + 1, $scope.gallery[0].children.length - 1);
        setTransform();
    };

}]);

lazyGallery.directive('guLazyGalleryControl', [function() {
    return {
        restrict: 'A',
        controller: 'GuLazyGalleryCtrl',
        link: function(scope, element, attrs, ctrl) {
            scope.nextItem = ctrl.nextItem;
            scope.previousItem = ctrl.previousItem;
        }
    };
}]);

lazyGallery.directive('guLazyGallery', [function() {
    return {
        restrict: 'A',
        controller: 'GuLazyGalleryCtrl',
        link: function(scope, element) {
            scope.gallery = element[0];
        }
    };
}]);
