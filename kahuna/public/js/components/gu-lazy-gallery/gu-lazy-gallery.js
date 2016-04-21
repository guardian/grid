import angular from 'angular';

export var lazyGallery = angular.module('gu.lazyGallery', []);

lazyGallery.controller('GuLazyGalleryCtrl', [
    '$scope',
    function(
        $scope) {
        $scope.pos = 0;

        function setTransform() {
            $scope.gallery[0].style.transform = 'translate3d(' + (-$scope.pos * $scope.gallery[0].offsetWidth) + 'px,0,0)';
        }

        $scope.previousItem = function() {
            $scope.pos = Math.max($scope.pos - 1, 0);
            setTransform();
        };

        $scope.nextItem = function() {
            $scope.pos = Math.min($scope.pos + 1, $scope.galleryLength - 1);
            setTransform();
        };


}]);

lazyGallery.directive('guLazyGalleryList', [function() {
    return {
        restrict: 'A',
        controller: 'GuLazyGalleryCtrl',
        link: function(scope, element) {
            scope.gallery = element;

            scope.$watch(() => {
                return element[0].children.length;
            }, (val) => scope.galleryLength = val);
        }
    };
}]);

lazyGallery.directive('guLazyGallery', [function() {
    return {
        restrict: 'A',
        link: function(scope) {
            scope.galleryLoading = true;
            setTimeout(function() {
                scope.galleryLoading = false;
            }, 2000);
        }
    };
}]);
