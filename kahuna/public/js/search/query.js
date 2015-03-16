import angular from 'angular';
import 'angular-animate';
import moment from 'moment';
import '../util/eq';
import template from './query.html!text';


export var query = angular.module('kahuna.search.query', [
    'ngAnimate',
    'util.eq'
]);

query.controller('SearchQueryCtrl',
                 ['$scope', '$state', '$stateParams', 'onValChange', 'mediaApi',
                 function($scope, $state, $stateParams, onValChange , mediaApi) {

    var ctrl = this;
    ctrl.uploadedByMe = false;

    ctrl.resetQueryAndFocus = resetQueryAndFocus;

    // Note that this correctly uses local datetime and returns
    // midnight for the local user
    var lastMidnight = moment().startOf('day').toISOString();

    ctrl.sinceOptions = [
        {label: 'anytime'},   // value: undefined
        {label: 'today',         value: lastMidnight},
        {label: 'past 24 hours', value: '24.hour'},
        {label: 'past week',     value: '1.week'}
    ];

    Object.keys($stateParams)
          .forEach(setAndWatchParam);

    // pass undefined to the state on empty to remove the QueryString
    function valOrUndefined(str) { return str || undefined; }

    function setAndWatchParam(key) {
        ctrl[key] = $stateParams[key];

        // watch ctrl and stateParams for changes and apply them accordingly
        $scope.$watch(() => ctrl[key], onValChange(newVal => {
            $state.go('search.results', { [key]: valOrUndefined(newVal) });
        }));

        $scope.$watch(() => $stateParams[key], onValChange(newVal => {
            ctrl[key] = valOrUndefined(newVal);
        }));
    }

    // we can't user dynamic values in the ng:true-value see:
    // https://docs.angularjs.org/error/ngModel/constexpr
    mediaApi.getSession().then(session => {
        ctrl.user = session.user;
        ctrl.uploadedByMe = ctrl.uploadedBy === ctrl.user.email;
    });

    $scope.$watch(() => ctrl.uploadedByMe, onValChange(uploadedByMe => {
        // uploadedByMe typeof boolean
        if (uploadedByMe) {
            ctrl.uploadedBy = ctrl.user.email;
        } else {
            delete ctrl.uploadedBy;
        }
    }));

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
      scope.$on(attr.gridFocusOn, () => {
          elem[0].focus();
      });
   };
});
