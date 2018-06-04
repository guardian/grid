/* */ 
"format cjs";
  rxModule.run(['$parse', function($parse) {

    observableProto.digest = function($scope, prop) {
      var source = this;
      return new AnonymousObservable(function (observer) {
        var propSetter = $parse(prop).assign;

        var m = new SingleAssignmentDisposable();

        m.setDisposable(source.subscribe(
          function (e) {
            if (!$scope.$$phase) {
              $scope.$apply(propSetter($scope, e));
            } else {
              propSetter($scope, e);
            }
          },
          observer.onError.bind(observer),
          observer.onCompleted.bind(observer)
        ));

        $scope.$on('$destroy', m.dispose.bind(m));

        return m;
      });
    };
  }]);
