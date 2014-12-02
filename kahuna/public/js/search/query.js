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

        // TODO: make helper for onchange vs onupdate
        $scope.$watch(() => ctrl[key], (newVal, oldVal) => {
            if (newVal !== oldVal) {
                // we replace empty strings etc with undefined to clear the querystring
                $state.go('search.results', { [key]: newVal || undefined });
            }
        });
    }

    // we can't user dynamic values in the ng:true-value see:
    // https://docs.angularjs.org/error/ngModel/constexpr
    // perhaps this functionality will change if we move to gmail type search e.g.
    // "uploadedBy:anthony.trollope@guardian.co.uk"
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
