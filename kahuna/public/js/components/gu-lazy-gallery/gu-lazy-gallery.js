import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';

import template from './gu-lazy-gallery.html!text';

import '../../util/rx';

export var lazyGallery = angular.module('gu.lazyGallery', ['util.rx']);

lazyGallery.controller('GuLazyGalleryCtrl', ['$rootScope', function($rootScope) {
    let ctrl = this;

    ctrl.init = function(items$) {
        ctrl.currentIndex = 0;
        ctrl.canGoNext = false;
        ctrl.canGoPrev = false;

        const itemsCount$ = items$.map(items => items.length).distinctUntilChanged();

        const buttonCommands$ = new Rx.BehaviorSubject('galleryStart');

        ctrl.prevItem     = () => buttonCommands$.onNext('prevItem');
        ctrl.nextItem     = () => buttonCommands$.onNext('nextItem');
        ctrl.galleryStart = () => buttonCommands$.onNext('galleryStart');
        ctrl.galleryEnd   = () => buttonCommands$.onNext('galleryEnd');

        const itemsOffset$ = buttonCommands$.map(
            (command) => {
                return {
                    prevItem:  -1,
                    nextItem:  +1,
                    start:     0,
                    end:       0,
                }[command] || 0;
            });

        const testThing$ = itemsOffset$.map(button => console.log(button));

        const item$ = itemsOffset$.withLatestFrom(
            items$, itemsCount$,
            (itemsOffset, items, itemsCount) => {
                // @TODO: Simplify these conditions
                if (ctrl.currentIndex + itemsOffset >= 0 && ctrl.currentIndex + itemsOffset < itemsCount) {
                    ctrl.currentIndex += itemsOffset;
                    ctrl.canGoPrev = ctrl.currentIndex > 0;
                    ctrl.canGoNext = ctrl.currentIndex < (itemsCount - 1);
                }
                return items[ctrl.currentIndex];
        });

        return item$;
    };



}]);

lazyGallery.directive('guLazyGallery', ['observe$', 'observeCollection$', 'subscribe$', '$window',
                                        function(
                                            observe$, observeCollection$, subscribe$, $window) {
    return {
        restrict: 'E',
        controller: 'GuLazyGalleryCtrl',
        controllerAs: 'galleryCtrl',
        transclude: true,
        template: template,
        link: function(scope, element, attrs, ctrl) {
            // Map attributes as Observable streams
            const {
                guLazyGalleryItems:            itemsAttr,
                guLazyGallerySelectionMode:    selectionMode,
            } = attrs;

            const items$         = observeCollection$(scope, itemsAttr);
            const selectionMode$ = observe$(scope, selectionMode);

            const newItem$ = ctrl.init(items$);

            subscribe$(scope, selectionMode$, selectionMode => {
                ctrl.selectionMode = selectionMode;
            });

            subscribe$(scope, newItem$, newItem => {
                ctrl.item = newItem;
            });
        }
    };
}]);
