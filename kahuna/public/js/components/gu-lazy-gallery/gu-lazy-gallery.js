import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';

import template from './gu-lazy-gallery.html!text';

import '../../util/rx';

export var lazyGallery = angular.module('gu.lazyGallery', ['util.rx']);

function asInt(string) {
    return parseInt(string, 10);
}

lazyGallery.controller('GuLazyGalleryCtrl', ['$scope', 'subscribe$', function($scope, subscribe$) {
    let ctrl = this;
    ctrl.canGoNext = false;
    ctrl.canGoPrev = false;

    ctrl.init = function({items$, preloadedItems$, currentIndex$}) {
        const itemsCount$ = items$.map(items => items.length).distinctUntilChanged();

        const buttonCommands$ = new Rx.BehaviorSubject('galleryStart');

        ctrl.prevItem     = () => buttonCommands$.onNext('prevItem');
        ctrl.nextItem     = () => buttonCommands$.onNext('nextItem');
        ctrl.galleryStart = () => buttonCommands$.onNext('galleryStart');
        ctrl.galleryEnd   = () => buttonCommands$.onNext('galleryEnd');

        const itemsOffset$ = buttonCommands$.combineLatest(
            itemsCount$,
            (command, itemsCount) => {
                return {command, itemsCount};
            }).withLatestFrom(
                currentIndex$,
                ({command, itemsCount}, currentIndex) => {
                    return {
                        prevItem:     -1,
                        nextItem:     +1,
                        galleryStart: currentIndex * -1,
                        galleryEnd:   itemsCount - currentIndex - 1,
                    }[command] || 0;
                }
            );




        const updatedIndex$ = itemsOffset$.withLatestFrom(
            currentIndex$, itemsCount$,
            (itemsOffset, currentIndex, itemsCount)=> {
                const updatedIndex = currentIndex + itemsOffset;
                // Ignore if index is less than 0 or greater than total items
                if (updatedIndex >= 0 && updatedIndex < itemsCount) {
                    return updatedIndex;
                } else {
                    return currentIndex;
                }
        });

        const item$ = updatedIndex$.withLatestFrom(
            itemsCount$, items$,
            (updatedIndex, itemsCount, items) => {
                ctrl.canGoPrev = updatedIndex > 0;
                ctrl.canGoNext = updatedIndex < (itemsCount - 1);
                currentIndex$.onNext(updatedIndex);
                return items[updatedIndex];
        });

        const currentPage$ = currentIndex$.withLatestFrom(
            preloadedItems$,
            (currentIndex, preloadedItems) => {
                return Math.floor(currentIndex / preloadedItems) + 1;
        });

        const atLastItem$ = currentIndex$.withLatestFrom(
            currentPage$, preloadedItems$,
            (currentIndex, currentPage, preloadedItems) => {
                if (currentIndex === (preloadedItems * currentPage) - 1) {
                    return true;
                }
        });

        const rangeToLoad$ = atLastItem$.withLatestFrom(
            currentPage$, preloadedItems$,
            (atLastItem, currentPage, preloadedItems) => {
                const start = currentPage * preloadedItems;
                const end = ((currentPage + 1) * preloadedItems) - 1;
            return {start, end};
        }).
            // Debounce range loading, which also helps discard
            // erroneous large ranges while combining
            // loadedRangeStart$ and loadedRangeEnd$ changes (one after the other)
            debounce(10).
            // Ignore if either end isn't set (whole range already loaded)
            filter(({start, end}) => start !== -1 && end !== -1).
            // Ignore if $start after $end (incomplete combine$ state)
            filter(({start, end}) => start <= end).
            distinctUntilChanged(({start, end}) => `${start}-${end}`);

        return {
            item$,
            rangeToLoad$
        };
    };

}]);

lazyGallery.directive('guLazyGallery', ['observe$', 'observeCollection$', 'subscribe$', 'inject$',
                                        function(
                                            observe$, observeCollection$, subscribe$, inject$) {
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
                guLazyGalleryLoadRange:        loadRangeFn,
                guLazyGalleryPreloadedItems:   preloadedItemsAttr
            } = attrs;

            const items$          = observeCollection$(scope, itemsAttr);
            const selectionMode$  = observe$(scope, selectionMode);
            const preloadedItems$ = observe$(scope, preloadedItemsAttr).map(asInt);

            const currentIndex$ = new Rx.BehaviorSubject(0);

            const {item$, rangeToLoad$} = ctrl.init({items$, preloadedItems$, currentIndex$});

            subscribe$(scope, rangeToLoad$, range => {
                scope.$eval(loadRangeFn, range);
            });

            inject$(scope, currentIndex$, ctrl, 'currentIndex');
            inject$(scope, selectionMode$, ctrl, 'selectionMode');
            inject$(scope, item$, ctrl, 'item');
        }
    };
}]);
