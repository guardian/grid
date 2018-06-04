/* */ 
"format cjs";
;(function (undefined) {

	angular.module('observeOnScopeApp', ['rx'])
		.controller('AppCtrl', function($scope, observeOnScope) {

				observeOnScope($scope, 'name')
					.map(function(data){
						return data;
					})
					.subscribe(function(change) {
						$scope.observedChange = change;
						$scope.newValue = change.newValue;
						$scope.oldValue = change.oldValue;
					});
		});

}.call(this));