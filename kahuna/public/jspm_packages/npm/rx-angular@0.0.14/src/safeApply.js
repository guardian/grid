/* */ 
"format cjs";
  observableProto.safeApply = function($scope, fn){

    fn = angular.isFunction(fn) ? fn : noop;

    return this['do'](function (data) {
      ($scope.$$phase || $scope.$root.$$phase) ? fn(data) : $scope.$apply(function () {
        fn(data);
      });
    });
  };
