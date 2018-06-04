/* */ 
"format cjs";
;(function (undefined) {

    angular.module('example', ['rx'])
        .controller('AppCtrl', function($scope, $http, rx) {
            
            $scope.search = '';
            $scope.results = [];

            var search = function(term) {

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
                         .retry(10) // Retry 10 times then give up
                         .map(function(response){
                             return response.data[1];
                         });
            };

          /*
             The following code deals with:
             
             - throttleing the user input (we don't want to query the wikipedia API on each
             key stroke but rather when the user *stopped typing*)
             
             - filtering duplicates (eg. user types "house" (waits 500ms) types another letter and removes it
             immediatly again which would normaly result into another query with "house" even if thats
             what we are already on)
             
             - querying the service
             
             - dealing with out of order responses (when you query a server multiple times so that you have
                 multiple requests "in flight", you can never be sure that the response will arrive in order. 
                 The "Switch" Operator will make sure that everything will be fine.)
             */

            $scope
                .$toObservable('search')
                .throttle(300)
                .map(function(data){
                    return data.newValue;
                })
                .distinctUntilChanged()
                .select(search)
                .switchLatest()
                .subscribe(function(val){
                    $scope.results = val;
                });
        });

}.call(this));
