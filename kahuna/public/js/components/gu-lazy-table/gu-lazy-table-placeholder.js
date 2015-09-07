import angular from 'angular';

import '../../util/rx';

export var lazyTableCell = angular.module('gu.lazyTablePlaceholder', [
    'util.rx'
]);

lazyTableCell.directive('guLazyTablePlaceholder',
                        ['subscribe$',
                         function(subscribe$) {
    return {
        restrict: 'A',
        require: '^guLazyTable',
        // Limit DOM weight by only transcluding the content of this
        // element iff it is visible.
        link: function(scope, element, attrs, ctrl) {
            const index = scope.$eval(attrs.guLazyTablePlaceholder);
            const position$ = ctrl.getCellPosition$(index);
            subscribe$(scope, position$,
                       ({top, left, width, height}) => {
                // use applyAsync rather than rx.safeApply to batch
                // all cell's updates together
                scope.$applyAsync(() => {
                    element.css({
                        position: 'absolute',
                        top:    top    + 'px',
                        left:   left   + 'px',
                        width:  width  + 'px',
                        height: height + 'px'
                    });
                });
            });
        }
    };
}]);
