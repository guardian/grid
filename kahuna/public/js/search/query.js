import angular from 'angular';
import template from './query.html!text';


export var query = angular.module('kahuna.search.query', []);

// FIXME: replace this stuff with moment for sanity's sake

function getLastMidnight() {
    // Note that this correctly uses local datetime and returns
    // midnight for the local user
    var date = new Date();
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
}

function asISOStringNoMillis(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

query.controller('SearchQueryCtrl', ['$scope', '$state', '$stateParams', 'mediaApi',
                 function($scope, $state, $stateParams, mediaApi) {

    var ctrl = this;
    ctrl.uploadedByMe = false;

    ctrl.lastMidnight = getLastMidnight().toISOString();
    ctrl.resetQueryAndFocus = resetQueryAndFocus;

    ctrl.sinceOptions = [
        {label: 'anytime'},  // value: undefined
        {label: 'today',        value: asISOStringNoMillis(getLastMidnight())},
        {label: '24 hours ago', value: '24.hour'},
        {label: 'a week ago',   value: '1.week'}
    ];

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
    // "uploadedBy:anthony.trollope@***REMOVED***"
    mediaApi.getSession().then(session => ctrl.user = session.user);
    ctrl.uploadedByMe = !!$stateParams.uploadedBy;
    $scope.$watch(() => ctrl.uploadedByMe, (newVal, oldVal) => {
        if (newVal !== oldVal) {
            ctrl.uploadedBy = newVal && ctrl.user.email;
        }
    });

    function resetQueryAndFocus() {
        ctrl.query = '';
        $scope.$broadcast('search:focus-query');
    }
}]);

query.directive('searchQuery', [function() {
    return {
        restrict: 'E',
        controller: 'SearchQueryCtrl as searchQuery',
        template: template
    };
}]);

query.directive('gridFocusOn', function() {
   return function(scope, elem, attr) {
      scope.$on(attr.gridFocusOn, function(e) {
          elem[0].focus();
      });
   };
});
