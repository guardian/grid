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
        link: function(scope, element, attrs, ctrl) {
            const item = scope.$eval(attrs.guLazyTableCell);
            const position$ = ctrl.getCellPosition$(item);
            subscribe$(scope, position$,
                       ({top, left, width, height, display}) => {
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
