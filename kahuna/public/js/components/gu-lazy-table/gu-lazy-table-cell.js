import angular from 'angular';

export var lazyTableCell = angular.module('gu.lazyTableCell', [
    'rx.helpers'
]);

lazyTableCell.directive('guLazyTableCell',
                        ['subscribe$',
                         function(subscribe$) {
    return {
        restrict: 'A',
        require: '^guLazyTable',
        // Limit DOM weight by only transcluding the content of this
        // element iff it is visible.
        transclude: true,
        template: '<ng-transclude ng:if="guLazyTableCellVisible"></ng-transclude>',
        link: function(scope, element, attrs, ctrl) {
            const item = scope.$eval(attrs.guLazyTableCell);
            const position$ = ctrl.getCellPosition$(item);
            subscribe$(scope, position$,
                       ({top, left, width, height, display}) => {
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
        }
    };
}]);
