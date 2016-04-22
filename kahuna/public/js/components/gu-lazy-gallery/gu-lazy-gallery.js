import angular from 'angular';

export var lazyGallery = angular.module('gu.lazyGallery', []);

lazyGallery.controller('GuLazyGalleryCtrl', ['$scope', function($scope) {
    let ctrl = this;
    ctrl.pos = 0;

    ctrl.previousItem = function() {
        ctrl.pos = Math.max(ctrl.pos - 1, 0);
        setTransform();
    };

    ctrl.nextItem = function() {
        ctrl.pos = Math.min(ctrl.pos + 1, ctrl.galleryLength - 1);
        setTransform();
    };

    function updateScope() {
        $scope.pos = ctrl.pos;
    }

    function setTransform() {
        ctrl.gallery[0].style.transform = 'translate3d(' + (-ctrl.pos * ctrl.gallery[0].offsetWidth) + 'px,0,0)';
        updateScope();
    }


    $scope.previousItem = ctrl.previousItem;
    $scope.nextItem = ctrl.nextItem;
    updateScope();
}]);

lazyGallery.directive('guLazyGalleryList', [function() {
    return {
        restrict: 'A',
        controller: 'GuLazyGalleryCtrl',
        link: function(scope, element, attrs, ctrl) {
            ctrl.gallery = element;

            scope.$watch(() => {
                return element[0].children.length;
            }, (val) => ctrl.galleryLength = val);
        }
    };
}]);

lazyGallery.directive('guLazyGallery', [function() {
    return {
        restrict: 'A',
        controller: 'GuLazyGalleryCtrl',
        link: function(scope, element, attrs, ctrl) {
            scope.$watch(() => {
                return ctrl;
            }, (val) => ctrl = val);
        }
    };
}]);
