import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';

import elementResize from 'javascript-detect-element-resize';
let {addResizeListener, removeResizeListener} = elementResize;

import './rx-helpers';
import './gu-lazy-table-cell';

import {
    combine$,
    add$, sub$, mult$, div$, mod$,
    floor$, ceil$, max$
} from './observable-utils';


export var lazyTable = angular.module('gu.lazyTable', [
    'gu.lazyTableCell',
    'rx.helpers'
]);



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


lazyTable.controller('GuLazyTableCtrl', [function() {
    let ctrl = this;

    ctrl.init = function({items$, preloadedRows$, cellHeight$, cellMinWidth$,
                          containerWidth$, viewportTop$, viewportBottom$}) {
        const itemsCount$ = items$.map(items => items.length);

        const columns$ = max$(floor$(div$(containerWidth$, cellMinWidth$)), 1);
        const rows$ = ceil$(div$(itemsCount$, columns$));

        const cellWidth$ = floor$(div$(containerWidth$, columns$));

        const currentRowTop$    = floor$(div$(viewportTop$,    cellHeight$));
        const currentRowBottom$ = floor$(div$(viewportBottom$, cellHeight$));

        const loadedRowTop$ = max$(sub$(currentRowTop$, preloadedRows$), 0).
            distinctUntilChanged();
        const loadedRowBottom$ = combine$(currentRowBottom$, preloadedRows$, rows$,
                                          (currentRowBottom, preloadedRows, rows) => {
            return Math.min(currentRowBottom + preloadedRows, rows - 1);
        }).distinctUntilChanged();

        const loadedRangeStart$ = mult$(loadedRowTop$, columns$);
        const loadedRangeEnd$ = combine$(loadedRowBottom$, columns$, itemsCount$,
                                         (loadedRowBottom, columns, itemsCount) => {
            const endRowItemIndex = ((loadedRowBottom + 1) * columns) - 1;
            return Math.min(Math.max(endRowItemIndex, 0), itemsCount);
        });

        const rangeToLoad$ = combine$(
            items$, loadedRangeStart$, loadedRangeEnd$,
            (items, loadedRangeStart, loadedRangeEnd) => {
                const $start = findIndexFrom(items, undefined, loadedRangeStart);
                const $end   = findLastIndexFrom(items, undefined, loadedRangeEnd);
                return {$start, $end};
            }
        ).
            // Ignore if either end isn't set (whole range already loaded)
            filter(({$start, $end}) => $start !== -1 && $end !== -1).
            // Ignore if $start after $end (incomplete combine$ state)
            filter(({$start, $end}) => $start <= $end).
            distinctUntilChanged(({$start, $end}) => `${$start}-${$end}`);

        const viewHeight$ = mult$(rows$, cellHeight$);

        // Mutations needed here to access streams in this closure ;_;

        // Share subscriptions to these streams between all cells that
        // register to getItemPosition$
        ctrl.getItemPosition$ = createGetItemPosition$({
            items$:          items$.shareReplay(1),
            cellWidth$:      cellWidth$.shareReplay(1),
            cellHeight$:     cellHeight$.shareReplay(1),
            columns$:        columns$.shareReplay(1),
            preloadedRows$:  preloadedRows$.shareReplay(1),
            viewportTop$:    viewportTop$.shareReplay(1),
            viewportBottom$: viewportBottom$.shareReplay(1)
        });

        return {
            viewHeight$, rangeToLoad$
        };
    };


    function createGetCellPosition$({cellWidth$, cellHeight$, columns$,
                                     preloadedRows$, viewportTop$, viewportBottom$}) {

        const width$  = cellWidth$;
        const height$ = cellHeight$;
        const loadedHeight$ = mult$(preloadedRows$, height$);

        return (index) => {
            const top$    = mult$(floor$(columns$.map(col => index / col)), height$);
            const left$   = mult$(columns$.map(col => index % col), width$);

            const bottom$ = add$(top$, height$);
            const display$ = combine$(top$, bottom$, loadedHeight$,
                                      viewportTop$, viewportBottom$,
                                      (top, bottom, loadedHeight,
                                       viewportTop, viewportBottom) => {
                return (top    > viewportTop    - loadedHeight &&
                        bottom < viewportBottom + loadedHeight) ?
                       'block' :
                       'none';
            });

            return combine$(top$, left$, width$, height$, display$,
                            (top, left, width, height, display) => {
                return ({top, left, width, height, display});
            });
        };
    }

    function createGetItemPosition$({items$, cellWidth$, cellHeight$, columns$,
                                     preloadedRows$, viewportTop$, viewportBottom$}) {
        return (item) => {
            // share() because it's an expensive operation
            const index$  = items$.map(items => items.indexOf(item)).share();
            const getPos$ = createGetCellPosition$({
                cellWidth$, cellHeight$, columns$,
                preloadedRows$, viewportTop$, viewportBottom$
            });
            return index$.flatMap(getPos$);
        };
    }

}]);


lazyTable.directive('guLazyTable', ['$window', 'observe$',
                                    'observeCollection$', 'subscribe$',
                                    function($window, observe$,
                                             observeCollection$, subscribe$) {

    return {
        restrict: 'A',
        controller: 'GuLazyTableCtrl',
        link: function (scope, element, attrs, ctrl) {
            // Map attributes as Observable streams
            const {
                guLazyTable:              itemsAttr,
                guLazyTableLoadRange:     loadRangeFn,
                guLazyTableCellMinWidth:  cellMinWidthAttr,
                guLazyTableCellHeight:    cellHeightAttr,
                guLazyTablePreloadedRows: preloadedRowsAttr
            } = attrs;

            const items$         = observeCollection$(scope, itemsAttr);
            const cellMinWidth$  = observe$(scope, cellMinWidthAttr).map(asInt);
            const cellHeight$    = observe$(scope, cellHeightAttr).map(asInt);
            const preloadedRows$ = observe$(scope, preloadedRowsAttr).map(asInt);

            // Observe events affecting the view

            const viewportScrolled$ = Rx.DOM.fromEvent($window, 'scroll').
                // delay fine-tuned to roughly match 'slow scrolling'
                // speed but not fast scrolling
                debounce(80).
                startWith({/* init */});

            const viewportResized$ = Rx.DOM.fromEvent($window, 'resize').
                debounce(100).
                startWith({/* init */});

            // Element resized (possibly not the viewport, e.g. side-panel expanded)
            const elementResized$ = Rx.Observable.fromEventPattern(
                handler => addResizeListener(element[0], handler),
                handler => removeResizeListener(element[0], handler)
            ).
                startWith({/* init */});


            // Model container and viewport properties

            const containerWidth$ = combine$(
                viewportResized$,
                elementResized$,
                () => element[0].clientWidth
            ).shareReplay(1);

            const offsetTop$ = viewportScrolled$.map(() => {
                // For Chrome we need to read scrollTop on body, for
                // other browser it's on the documentElement. Meh.
                // https://miketaylr.com/posts/2014/11/document-body-scrollTop.html
                const scrollTop = document.body.scrollTop || document.documentElement.scrollTop;
                return Math.max(scrollTop - element[0].offsetTop, 0);
            }).shareReplay(1);

            const offsetHeight$ = combine$(viewportScrolled$, viewportResized$, () => {
                return Math.max(document.documentElement.clientHeight - element[0].offsetTop, 0);
            }).shareReplay(1);

            const viewportTop$    = offsetTop$;
            const viewportBottom$ = add$(offsetTop$, offsetHeight$);


            const {viewHeight$, rangeToLoad$} = ctrl.init({
                items$, preloadedRows$, cellHeight$, cellMinWidth$,
                containerWidth$, viewportTop$, viewportBottom$
            });

            // Table cells will be absolutely positioned within this container
            element.css({position: 'relative'});

            subscribe$(scope, rangeToLoad$, range => {
                scope.$eval(loadRangeFn, range);
            });

            subscribe$(scope, viewHeight$.distinctUntilChanged(), viewHeight => {
                // Delay application until after this cycle, possibly
                // with other cell rendering updates
                scope.$applyAsync(() => {
                    element.css('height', viewHeight + 'px');
                });
            });
        }
    };
}]);
