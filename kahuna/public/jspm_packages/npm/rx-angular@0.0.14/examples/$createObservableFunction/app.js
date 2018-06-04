/* */ 
"format cjs";
;(function (undefined) {

    angular.module('example', ['rx'])
        .controller('AppCtrl', function($scope, $http, rx) {

            function searchWikipedia (term) {
                var deferred = $http({
                        url: "http://en.wikipedia.org/w/api.php?&callback=JSON_CALLBACK",
                        method: "jsonp",
                        params: {
                            action: "opensearch",
                            search: term,
                            format: "json"
                        }
                    });

                return rx.Observable
                    .fromPromise(deferred)
                    .map(function(response){ return response.data[1]; });
            }

            $scope.search = '';
            $scope.results = [];

            /*
                The following code deals with:

                Creates a "submit" function which is an observable sequence instead of just a function.
            */
            $scope.$createObservableFunction('submit')
                .map(function (term) { return term; })
                .flatMapLatest(searchWikipedia)
                .subscribe(function(results) {
                    $scope.results = results;
                });
        });

}.call(this));