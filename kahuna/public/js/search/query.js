import angular from 'angular';
import 'angular-animate';
import moment from 'moment';
import '../util/eq';
import '../components/gu-date-range/gu-date-range';
import template from './query.html!text';

export var query = angular.module('kahuna.search.query', [
    'ngAnimate',
    'util.eq',
    'gu-dateRange'
]);

query.controller('SearchQueryCtrl',
                 ['$scope', '$state', '$stateParams', 'onValChange', 'mediaApi',
                 function($scope, $state, $stateParams, onValChange , mediaApi) {

    var ctrl = this;
    ctrl.filter = {
        uploadedByMe: false
    };

    ctrl.resetQueryAndFocus = resetQueryAndFocus;

    // Note that this correctly uses local datetime and returns
    // midnight for the local user
    var lastMidnight = moment().startOf('day').toISOString();

    var past24Hours = moment().subtract(24, 'hours').toISOString();
    var pastWeek = moment().subtract(7, 'days').toISOString();

    ctrl.sinceOptions = [
        {label: 'anytime'},   // value: undefined
        {label: 'today',         value: lastMidnight},
        {label: 'past 24 hours', value: past24Hours},
        {label: 'past week',     value: pastWeek}
    ];

    Object.keys($stateParams)
          .forEach(setAndWatchParam);

    // pass undefined to the state on empty to remove the QueryString
    function valOrUndefined(str) { return str || undefined; }

    function setAndWatchParam(key) {
        ctrl.filter[key] = $stateParams[key];

        $scope.$watch(() => $stateParams[key], onValChange(newVal => {
            ctrl[key] = valOrUndefined(newVal);
        }));
    }

    $scope.$watchCollection(() => ctrl.filter, onValChange(filter => {
        filter.uploadedBy = filter.uploadedByMe ? ctrl.user.email : undefined;
        $state.go('search.results', filter);
    }));

    // we can't user dynamic values in the ng:true-value see:
    // https://docs.angularjs.org/error/ngModel/constexpr
    mediaApi.getSession().then(session => {
        ctrl.user = session.user;
        ctrl.filter.uploadedByMe = ctrl.uploadedBy === ctrl.user.email;
    });

    function resetQueryAndFocus() {
        ctrl.filter.query = '';
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
      scope.$on(attr.gridFocusOn, () => {
          elem[0].focus();
      });
   };
});
