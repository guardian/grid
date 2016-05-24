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

    ctrl.init = function({items$, preloadedItems$, currentIndex$}) {
        ctrl.canGoNext = false;
        ctrl.canGoPrev = false;

        const itemsCount$ = items$.map(items => items.length).distinctUntilChanged();

        const buttonCommands$ = new Rx.BehaviorSubject(0).connect();

        ctrl.prevItem     = () => buttonCommands$.onNext('prevItem');
        ctrl.nextItem     = () => buttonCommands$.onNext('nextItem');
        ctrl.galleryStart = () => buttonCommands$.onNext('galleryStart');
        ctrl.galleryEnd   = () => buttonCommands$.onNext('galleryEnd');


        const itemsOffset$ = buttonCommands$.combineLatest(
            itemsCount$, currentIndex$,
            (command, itemsCount, currentIndex) => {
                console.log(command);
                // @TODO: Clean these up
                return {
                    prevItem:     -1,
                    nextItem:     +1,
                    galleryStart: currentIndex * -1,
                    galleryEnd:   itemsCount - currentIndex - 1,
                }[command] || 0;
            });

        const item$ = itemsOffset$.withLatestFrom(
            items$, itemsCount$, currentIndex$,
            (itemsOffset, items, itemsCount, currentIndex) => {
                // @TODO: Simplify these conditions
                console.log(itemsOffset);
                if (currentIndex + itemsOffset >= 0 && currentIndex + itemsOffset < itemsCount) {
                    currentIndex += itemsOffset;
                    ctrl.canGoPrev = currentIndex > 0;
                    ctrl.canGoNext = currentIndex < (itemsCount - 1);
                    currentIndex$.onNext(currentIndex);
                }
                return items[currentIndex];

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
            currentIndex$.subscribe(i => console.log("iiii", i));
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
