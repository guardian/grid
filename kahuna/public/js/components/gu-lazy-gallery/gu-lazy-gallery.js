import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';

import template from './gu-lazy-gallery.html!text';

import '../../util/rx';

import {
    combine$,
    sub$, max$
} from '../gu-lazy-table/observable-utils';

export var lazyGallery = angular.module('gu.lazyGallery', ['util.rx']);

function asInt(string) {
    return parseInt(string, 10);
}

function findIndexFrom(array, item, fromIndex) {
    for (let i = fromIndex, len = array.length; i < len; i++) {
        if (array[i] === item) {
            return i;
        }
    }
    return -1;
}

function findLastIndexFrom(array, item, fromIndex) {
    for (let i = fromIndex; i >= 0; i--) {
        if (array[i] === item) {
            return i;
        }
    }
    return -1;
}

lazyGallery.controller('GuLazyGalleryCtrl', ['$rootScope', function() {
    let ctrl = this;

    ctrl.init = function({items$, preloadedItems$}) {
        ctrl.currentIndex = 0;
        ctrl.canGoNext = false;
        ctrl.canGoPrev = false;

        const itemsCount$ = items$.map(items => items.length).distinctUntilChanged();

        const currentFirstItem$ = items$.map(items => {
            return items[0];
        }).distinctUntilChanged();

        const currentLastItem$ = items$.map(items => {
            return items[items.length -1];
        }).distinctUntilChanged();

        const buttonCommands$ = new Rx.Subject();

        ctrl.prevItem     = () => buttonCommands$.onNext('prevItem');
        ctrl.nextItem     = () => buttonCommands$.onNext('nextItem');
        ctrl.galleryStart = () => buttonCommands$.onNext('galleryStart');
        ctrl.galleryEnd   = () => buttonCommands$.onNext('galleryEnd');

        const itemsOffset$ = buttonCommands$.withLatestFrom(
            itemsCount$,
            (command, itemsCount) => {
                // @TODO: Clean these up
                return {
                    prevItem:     -1,
                    nextItem:     +1,
                    galleryStart: ctrl.currentIndex * -1,
                    galleryEnd:   itemsCount - ctrl.currentIndex - 1,
                }[command] || 0;
            });

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
        }).shareReplay(1);

        const loadedItemFirst$ = max$(sub$(currentFirstItem$, preloadedItems$), 0).
            distinctUntilChanged();
        const loadedItemLast$ = combine$(currentLastItem$, preloadedItems$, itemsCount$,
                                          (currentLastItem, preloadedItems, itemsCount) => {
            console.log(currentLastItem);
            return Math.min(currentLastItem + preloadedItems, itemsCount - 1);
        }).distinctUntilChanged();

        const rangeToLoad$ = combine$(
            items$, loadedItemFirst$, loadedItemLast$,
            (items, loadedItemFirst, loadedItemLast) => {
                const $start = findIndexFrom(items, undefined, loadedItemFirst);
                const $end   = findLastIndexFrom(items, undefined, loadedItemLast);
                return {$start, $end};
            }
        ).
            // Debounce range loading, which also helps discard
            // erroneous large ranges while combining
            // loadedRangeStart$ and loadedRangeEnd$ changes (one after the other)
            debounce(10).
            // Ignore if either end isn't set (whole range already loaded)
            filter(({$start, $end}) => $start !== -1 && $end !== -1).
            // Ignore if $start after $end (incomplete combine$ state)
            filter(({$start, $end}) => $start <= $end).
            distinctUntilChanged(({$start, $end}) => `${$start}-${$end}`);

        ctrl.galleryStart();

        return {
            item$,
            rangeToLoad$
        };
    };

}]);

lazyGallery.directive('guLazyGallery', ['observe$', 'observeCollection$', 'subscribe$',
                                        function(
                                            observe$, observeCollection$, subscribe$) {
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

            const items$         = observeCollection$(scope, itemsAttr);
            const selectionMode$ = observe$(scope, selectionMode);
            const preloadedItems$ = observe$(scope, preloadedItemsAttr).map(asInt);

            const {item$, rangeToLoad$} = ctrl.init({items$, preloadedItems$});


            subscribe$(scope, rangeToLoad$, range => {
                console.log(range);
                scope.$eval(loadRangeFn, range);
            });

            subscribe$(scope, selectionMode$, selectionMode => {
                ctrl.selectionMode = selectionMode;
            });

            subscribe$(scope, item$, item => {
                ctrl.item = item;
            });
        }
    };
}]);
