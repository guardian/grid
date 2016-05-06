import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';

import template from './gu-lazy-gallery.html!text';

import '../../util/rx';

export var lazyGallery = angular.module('gu.lazyGallery', ['util.rx']);

lazyGallery.controller('GuLazyGalleryCtrl', [function() {
    let ctrl = this;

    ctrl.init = function(items$) {
        ctrl.currentIndex = 0;

        const itemsCount$ = items$.map(items => items.length).distinctUntilChanged();

        const buttonCommands$ = new Rx.BehaviorSubject('start');

        ctrl.prevItem     = () => buttonCommands$.onNext('prevItem');
        ctrl.nextItem     = () => buttonCommands$.onNext('nextItem');
        ctrl.galleryStart = () => buttonCommands$.onNext('start');
        ctrl.galleryEnd   = () => buttonCommands$.onNext('end');

        const itemsOffset$ = buttonCommands$.map(
            (command) => {
                console.log('Here!');
                return {
                    prevItem:  -1,
                    nextItem:  +1,
                    start:     0,
                    end:       0,
                }[command] || 0;
            });

        const item$ = itemsOffset$.withLatestFrom(
            items$,
            (itemsOffset, items) => {
                console.log(itemsOffset);
                ctrl.currentIndex += itemsOffset;
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
                console.log(newItem);
                ctrl.item = newItem;
            });
        }
    };
}]);
