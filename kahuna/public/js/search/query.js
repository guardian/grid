import angular from 'angular';

export var query = angular.module('kahuna.search.query', []);

query.controller('SearchQueryCtrl', ['$scope', '$state', '$stateParams', 'mediaApi',
                 function($scope, $state, $stateParams, mediaApi) {

    var ctrl = this;
    ctrl.uploadedByMe = false;

    Object.keys($stateParams)
          .forEach(setAndWatchParam);

    function setAndWatchParam(key) {
        ctrl[key] = $stateParams[key];
        $scope.$watch(() => ctrl[key], (newVal, oldVal) => {
            if (newVal !== oldVal) {
                // we replace empty strings etc with undefined to clear the querystring
                $state.go('search.results', { [key]: newVal || undefined });
            }
        });
    }

    ctrl.sinceSearches = [
        {
            name: 'anytime'
        },
        {
            name: 'last 24 hours',
            value: '24.hour'
        },
        {
            name: 'last week',
            value: '1.week'
        }
    ];

    // FIXME: There are two other bugs here once that is done:
    // * ui-router seems to decode `%40` -> `@` in the querystring
    // * this in turn makes system JS to go wobbly

    // we can't user dynamic values in the ng:true-value see:
    // https://docs.angularjs.org/error/ngModel/constexpr
    // perhaps this functionality will change if we move to gmail type search e.g.
    // "uploadedBy:anthony.trollope@***REMOVED***"
    mediaApi.getSession().then(session => ctrl.user = session.user);
    ctrl.uploadedByMe = !!$stateParams.uploadedBy;
    $scope.$watch(() => ctrl.uploadedByMe, (newVal, oldVal) => {
        if (newVal !== oldVal) {
            ctrl.uploadedBy = newVal && ctrl.user.email;
        }
    });
}]);

query.directive('searchQuery', ['jsDirectory', function(jsDirectory) {
    return {
        restrict: 'E',
        controller: 'SearchQueryCtrl as searchQuery',
        templateUrl: jsDirectory + '/search/query.html'
    };
}]);