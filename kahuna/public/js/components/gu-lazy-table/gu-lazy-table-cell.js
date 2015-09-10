import angular from 'angular';

import '../../util/rx';

export var lazyTableCell = angular.module('gu.lazyTableCell', [
    'util.rx'
]);

lazyTableCell.directive('guLazyTableCell',
                        ['subscribe$', 'observe$',
                         function(subscribe$, observe$) {
    return {
        restrict: 'A',
        require: '^guLazyTable',
        // Limit DOM weight by only transcluding the content of this
        // element iff it is visible.
        transclude: true,
        template: '<ng-transclude ng:if="guLazyTableCellVisible"></ng-transclude>',
        link: function(scope, element, attrs, ctrl) {
            const item$ = observe$(scope, attrs.guLazyTableCell);
            const position$ = item$.flatMapLatest(ctrl.getItemPosition$);
            subscribe$(scope, position$,
                       ({top, left, width, height, display}) => {
                // use applyAsync rather than rx.safeApply to batch
                // all cell's updates together
                scope.$applyAsync(() => {
                    scope.guLazyTableCellVisible = display === 'block';
                    element.css({
                        position: 'absolute',
                        top:    top    + 'px',
                        left:   left   + 'px',
                        width:  width  + 'px',
                        height: height + 'px',
                        display: display
                    });
                });
            });
        }
    };
}]);
