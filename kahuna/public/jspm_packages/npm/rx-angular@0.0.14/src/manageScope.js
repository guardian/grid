/* */ 
"format cjs";
  var manageScope = Rx.manageScope = function ($scope) {

    return function(observer) {

        var source = observer;

        return new AnonymousObservable(function (observer) {

            var m = new SingleAssignmentDisposable();

            var scheduler = Rx.ScopeScheduler($scope);

            m.setDisposable(source
                .observeOn(scheduler)
                .subscribe(
                    observer.onNext.bind(observer),
                    observer.onError.bind(observer),
                    observer.onCompleted.bind(observer)
            ));

            $scope.$on("$destroy", function() {
                m.dispose();
                delete m;
            });

            return m;
        });
      }
  }

