import angular from 'angular';

export var lazyGallery = angular.module('gu.lazyGallery', []);

lazyGallery.controller('GuLazyGalleryCtrl', [function() {
    let ctrl = this;
    ctrl.pos = 0;

    function setTransform() {
        ctrl.gallery.style.transform = 'translate3d(' + (-ctrl.pos * ctrl.gallery.offsetWidth) + 'px,0,0)';
    }

    ctrl.previousItem = function() {
        console.log("Previous");
        ctrl.pos = Math.max(ctrl.pos - 1, 0);
        setTransform();
    }

    ctrl.nextItem = function() {
        console.log(ctrl.galleryLength);
        ctrl.pos = Math.min(ctrl.pos + 1, ctrl.galleryLength - 1);
        setTransform();
    }

    console.log(ctrl);
}]);

lazyGallery.directive('guLazyGallery', [function() {
    return {
        restrict: 'A',
        controller: 'GuLazyGalleryCtrl',
        scope: {
            galleryLoading: '=',
            previousItem: '=',
            nextItem: '&',
            gallery: '=',
            galleryLength: '=',
            list: '@guLazyGalleryList' // Stops a stupidly long chain of magic element selectors
        },
        controllerAs: 'galleryCtrl',
        bindToController: true,
        transclude: 'true',
        template: `
            <ng-transclude></ng-transclude>
            <div class="gallery__controls">
                <button class="gallery__control gallery__control--left"
                        ng:class="{ 'gallery__control--disabled': galleryCtrl.pos === 0 }"
                        ng:disabled="galleryCtrl.pos === 0"
                        ng:click="galleryCtrl.previousItem()">
                    <gr-icon-label gr-icon="keyboard_arrow_left">Previous</gr-icon-label>
                </button>

                <button class="gallery__control gallery__control--right"
                        ng:class="{ 'gallery__control--disabled': galleryCtrl.pos === galleryCtrl.galleryLength - 1 }"
                        ng:disabled="galleryCtrl.pos === galleryCtrl.galleryLength - 1"
                        ng:click="galleryCtrl.nextItem()">
                    <gr-icon-label gr-icon="keyboard_arrow_right">Next</gr-icon-label>
                </button>
            </div>`,
        link: function(scope, element, attrs, galleryCtrl) {
            galleryCtrl.galleryLoading = true;
            galleryCtrl.gallery = document.getElementsByClassName(galleryCtrl.list)[0];
            scope.$watch(() => {
                    return galleryCtrl.gallery.children.length;
                },
                (val) => {
                    galleryCtrl.galleryLength = val;
                });
        }
    };
}]);
