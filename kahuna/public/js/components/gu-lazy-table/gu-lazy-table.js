import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';
import 'javascript-detect-element-resize';

import './gu-lazy-table-cell';
import './gu-lazy-table-placeholder';
import '../../util/rx';
import '../../util/seq';

/* global addResizeListener */
/* global removeResizeListener */

import {
    combine$,
    add$, sub$, mult$, div$, mod$,
    floor$, ceil$, max$, min$, round$
} from './observable-utils';


export var lazyTable = angular.module('gu.lazyTable', [
    'gu.lazyTableCell',
    'gu.lazyTablePlaceholder',
    'util.rx',
    'util.seq'
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


lazyTable.controller('GuLazyTableCtrl', ['range', function(range) {
    let ctrl = this;

    ctrl.init = function({items$, preloadedRows$, cellHeight$, cellMinWidth$,
                          containerWidth$, viewportHeight$, viewportTop$}) {
        const itemsCount$ = items$.map(items => items.length).distinctUntilChanged();

        const columns$ = max$(floor$(div$(containerWidth$, cellMinWidth$)), 1);
        const rows$ = ceil$(div$(itemsCount$, columns$));

        const cellWidth$ = floor$(div$(containerWidth$, columns$));

        const viewportBottom$ = add$(viewportTop$, viewportHeight$);

        const currentRowTop$    = round$(div$(viewportTop$,    cellHeight$));
        const currentRowBottom$ = round$(div$(viewportBottom$, cellHeight$));

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
            // Debounce range loading, which also helps discard
            // erroneous large ranges while combining
            // loadedRangeStart$ and loadedRangeEnd$ changes (one after the other)
            debounce(10).
            // Ignore if either end isn't set (whole range already loaded)
            filter(({$start, $end}) => $start !== -1 && $end !== -1).
            // Ignore if $start after $end (incomplete combine$ state)
            filter(({$start, $end}) => $start <= $end).
            distinctUntilChanged(({$start, $end}) => `${$start}-${$end}`);

        // Placeholders
        const placeholderExtraCount$ = mult$(columns$, preloadedRows$);
        const placeholderRangeStart$ = max$(sub$(loadedRangeStart$, placeholderExtraCount$), 0);
        const placeholderRangeEnd$ = min$(add$(loadedRangeEnd$, placeholderExtraCount$),
                                          sub$(itemsCount$, 1));

        const placeholderIndexes$ = combine$(
            placeholderRangeStart$, placeholderRangeEnd$,
            (placeholderRangeStart, placeholderRangeEnd) => {
                let indexes = range(placeholderRangeStart, placeholderRangeEnd);
                return Array.from(indexes);
            }
        );

        const viewHeight$ = mult$(rows$, cellHeight$);

        // Mutations needed here to access streams in this closure ;_;

        // Share subscriptions to these streams between all cells and
        // placeholders that register to their position

        const itemsShared$          = items$.shareReplay(1);
        const cellWidthShared$      = cellWidth$.shareReplay(1);
        const cellHeightShared$     = cellHeight$.shareReplay(1);
        const columnsShared$        = columns$.shareReplay(1);
        const preloadedRowsShared$  = preloadedRows$.shareReplay(1);
        const viewportTopShared$    = viewportTop$.shareReplay(1);
        const viewportBottomShared$ = viewportBottom$.shareReplay(1);

        ctrl.getItemPosition$ = createGetItemPosition$({
            items$:          itemsShared$,
            cellWidth$:      cellWidthShared$,
            cellHeight$:     cellHeightShared$,
            columns$:        columnsShared$,
            preloadedRows$:  preloadedRowsShared$,
            viewportTop$:    viewportTopShared$,
            viewportBottom$: viewportBottomShared$
        });

        ctrl.getCellPosition$ = createGetCellPosition$({
            cellWidth$:      cellWidthShared$,
            cellHeight$:     cellHeightShared$,
            columns$:        columnsShared$,
            preloadedRows$:  preloadedRowsShared$,
            viewportTop$:    viewportTopShared$,
            viewportBottom$: viewportBottomShared$
        });

        const rowsInViewport$ = max$(floor$(div$(viewportHeight$, cellHeight$)), 1);

        // Marginally satisfying pattern to convert from imperative to
        // reactive land
        const scrollCommands$ = Rx.Observable.create(observer => {
            ctrl.scrollPrevRow  = () => observer.onNext('prevRow');
            ctrl.scrollNextRow  = () => observer.onNext('nextRow');
            ctrl.scrollPrevPage = () => observer.onNext('prevPage');
            ctrl.scrollNextPage = () => observer.onNext('nextPage');
            ctrl.scrollStart    = () => observer.onNext('start');
            ctrl.scrollEnd      = () => observer.onNext('end');
        });

        const rowOffset$ = scrollCommands$.withLatestFrom(
            rowsInViewport$, currentRowTop$, rows$,
            (command, rowsInViewport, currentRowTop, rows) => {
                return {
                    prevRow:  - 1,
                    nextRow:  + 1,
                    prevPage: - rowsInViewport,
                    nextPage: + rowsInViewport,
                    start:    - currentRowTop,
                    end:      rows - currentRowTop
                }[command] || 0;
            });

        const newScrollTop$ = rowOffset$.withLatestFrom(currentRowTop$, cellHeight$,
                                                        (rowOffset, currentRowTop, cellHeight) => {
            return (currentRowTop + rowOffset) * cellHeight;
        });

        return {
            viewHeight$, rangeToLoad$, placeholderIndexes$, newScrollTop$
        };
    };


    function createGetCellPosition$({cellWidth$, cellHeight$, columns$,
                                     preloadedRows$, viewportTop$, viewportBottom$}) {

        const width$  = cellWidth$;
        const height$ = cellHeight$;
        const loadedHeight$ = mult$(preloadedRows$, height$);

        return (index) => {
            const top$    = mult$(floor$(div$(index, columns$)), height$);
            const left$   = mult$(mod$(index, columns$), width$);

            const bottom$ = add$(top$, height$);
            const display$ = combine$(top$, bottom$, loadedHeight$,
                                      viewportTop$, viewportBottom$,
                                      (top, bottom, loadedHeight,
                                       viewportTop, viewportBottom) => {
                // TODO: allow this to be configured
                const unloadHeight = 2 * loadedHeight;
                return (top    > viewportTop    - unloadHeight &&
                        bottom < viewportBottom + unloadHeight) ?
                       'block' :
                       'none';
            });

            return combine$(top$, left$, width$, height$, display$,
                            (top, left, width, height, display) => {
                return ({top, left, width, height, display});
            }).
                distinctUntilChanged(({top, left, width, height, display}) =>
                                    `${top}-${left}-${width}-${height}-${display}`);
        };
    }

    function createGetItemPosition$({items$, cellWidth$, cellHeight$, columns$,
                                     preloadedRows$, viewportTop$, viewportBottom$}) {
        return (item) => {
            // share() because it's an expensive operation
            const index$  = items$.map(items => items.indexOf(item)).
                distinctUntilChanged().
                share();
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
        transclude: true,
        template: `
<ul>
  <li ng:repeat="placeholderIndex in $placeholders"
      class="result-placeholder"
      gu:lazy-table-placeholder="placeholderIndex"></li>
</ul>
<ng-transclude></ng-transclude>
`,
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

            // Offset between container top and top of scrolling area (page)
            // Read once as we assume it never changes
            const containerTop = element[0].getClientRects()[0].top;

            const containerWidth$ = combine$(
                viewportResized$,
                elementResized$,
                () => element[0].clientWidth
            ).shareReplay(1);

            const offsetTop$ = viewportScrolled$.map(() => {
                // For Chrome we need to read scrollTop on body, for
                // other browser it's on the documentElement. Meh.
                // https://miketaylr.com/posts/2014/11/document-body-scrollTop.html
                return document.body.scrollTop || document.documentElement.scrollTop;
            }).shareReplay(1);

            const offsetHeight$ = combine$(viewportScrolled$, viewportResized$, () => {
                return Math.max(document.documentElement.clientHeight - containerTop, 0);
            }).shareReplay(1);

            const viewportTop$    = offsetTop$;
            const viewportHeight$ = offsetHeight$;

            const {viewHeight$, rangeToLoad$, placeholderIndexes$, newScrollTop$} = ctrl.init({
                items$, preloadedRows$, cellHeight$, cellMinWidth$,
                containerWidth$, viewportTop$, viewportHeight$
            });

            // Table cells will be absolutely positioned within this container
            element.css({position: 'relative'});

            subscribe$(scope, rangeToLoad$, range => {
                scope.$eval(loadRangeFn, range);
            });

            subscribe$(scope, placeholderIndexes$, indexes => {
                scope.$placeholders = indexes;
            });

            subscribe$(scope, viewHeight$.distinctUntilChanged(), viewHeight => {
                // Delay application until after this cycle, possibly
                // with other cell rendering updates
                scope.$applyAsync(() => {
                    element.css('height', viewHeight + 'px');
                    scope.$emit('gu-lazy-table:height-changed', viewHeight);
                });
            });

            subscribe$(scope, newScrollTop$, newScrollTop => {
                // Note: it may be negative or beyond the page height,
                // but the browser will normalise that anyway
                window.scrollTo(0, newScrollTop);
            });
        }
    };
}]);
