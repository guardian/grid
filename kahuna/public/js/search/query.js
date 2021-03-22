import angular from 'angular';
// FIXME: used to fade 'x' query clear button, but disabled as it ends
// up being enabled globally and severely degrades the performance of
// the lazy-table for results. Once there is a working way to disable
// animations locally, we should turn it back on here.
// import 'angular-animate';
import moment from 'moment';
import {eq} from '../util/eq';
import {guDateRange} from '../components/gu-date-range/gu-date-range';
import template from './query.html';
import {syntax} from './syntax/syntax';
import {grStructuredQuery} from './structured-query/structured-query';

export var query = angular.module('kahuna.search.query', [
    // Note: temporarily disabled for performance reasons, see above
    // 'ngAnimate',
    eq.name,
    guDateRange.name,
    syntax.name,
    grStructuredQuery.name
]);

query.controller('SearchQueryCtrl', [
  '$rootScope',
  '$scope',
  '$state',
  '$stateParams',
  'onValChange',
  'mediaApi',
  function($rootScope, $scope, $state, $stateParams, onValChange, mediaApi) {

    const ctrl = this;

    ctrl.canUpload = false;

    mediaApi.canUserUpload().then(canUpload => {
        ctrl.canUpload = canUpload;
    });

    ctrl.ordering = {
        orderBy: $stateParams.orderBy
    };

    ctrl.filter = {
        uploadedByMe: false
    };

    ctrl.dateFilter = {
        // filled in by the watcher below
    };

    ctrl.resetQuery = resetQuery;

    // Note that this correctly uses local datetime and returns
    // midnight for the local user
    const lastMidnight  = moment().startOf('day').toISOString();
    const past24Hours   = moment().subtract(24, 'hours').toISOString();
    const pastWeek      = moment().subtract(7, 'days').toISOString();
    const past6Months   = moment().subtract(6, 'months').toISOString();
    const pastYear      = moment().subtract(1, 'years').toISOString();

    ctrl.payTypeOptions = [
        {label: 'Free', value: 'free'},
        {label: 'Free and No Rights', value: 'maybe-free'},
        {label: 'All (inc. paid)', value: 'all'}
    ];

    ctrl.sinceOptions = [
        {label: 'Anytime'},   // value: undefined
        {label: 'Today',         value: lastMidnight},
        {label: 'Past 24 hours', value: past24Hours},
        {label: 'Past week',     value: pastWeek},
        {label: 'Past 6 months', value: past6Months},
        {label: 'Past year',     value: pastYear}
    ];

    ctrl.filterDateFieldsOptions = [
        {label: 'Upload time',   name: 'uploaded'}, // value: undefined
        {label: 'Date taken',    name: 'taken',        value: 'taken'},
        {label: 'Last modified', name: 'modified',     value: 'modified'}
    ];

    const dateFilterParams = [
        'dateField', 'since', 'until', 'takenSince', 'takenUntil',
        'modifiedSince', 'modifiedUntil'
    ];

    Object.keys($stateParams).
        // Exclude date-related filters, managed separately in dateFilter
        filter(key => dateFilterParams.indexOf(key) === -1).
        forEach(setAndWatchParam);

    // URL parameters are not decoded when taken out of the params.
    // Might be fixed with: https://github.com/angular-ui/ui-router/issues/1759
    // Pass undefined to the state on empty to remove the QueryString
    function valOrUndefined(str) { return str ? str : undefined; }

    function setAndWatchParam(key) {
        //this value has been set on ctrl.order
        if (key !== 'orderBy') {
            ctrl.filter[key] = valOrUndefined($stateParams[key]);
        }

        ctrl.collectionSearch = ctrl.filter.query ?  ctrl.filter.query.indexOf('~') === 0 : false;

        $scope.$watch(() => $stateParams[key], onValChange(newVal => {
            // FIXME: broken for 'your uploads'
            // FIXME: + they triggers filter $watch and $state.go (breaks history)
            if (key === 'orderBy') {
                ctrl.ordering[key] = valOrUndefined(newVal);
            } else {
                ctrl.filter[key] = valOrUndefined(newVal);
            }

            // don't track changes to `query` as it would trigger on every keypress
            if (key !== 'query') {
                $rootScope.$emit(
                  'track:event', 'Query', 'Change', 'Success', null, { field: key, value: newVal }
                );
            }
        }));
    }

    // Init and apply date-related changes in $stateParams to ctrl.dateFilter
    $scope.$watchCollection(() => $stateParams, () => {
        switch ($stateParams.dateField) {
        case 'taken':
            ctrl.dateFilter.since = $stateParams.takenSince;
            ctrl.dateFilter.until = $stateParams.takenUntil;
            ctrl.dateFilter.field = 'taken';
            break;
        case 'modified':
            ctrl.dateFilter.since = $stateParams.modifiedSince;
            ctrl.dateFilter.until = $stateParams.modifiedUntil;
            ctrl.dateFilter.field = 'modified';
            break;
        default: // uploaded (default so represented as `undefined`)
            ctrl.dateFilter.since = $stateParams.since;
            ctrl.dateFilter.until = $stateParams.until;
            ctrl.dateFilter.field = undefined;
            break;
        }
    });


    $scope.$watchCollection(() => ctrl.filter, onValChange(filter => {
        filter.uploadedBy = filter.uploadedByMe ? ctrl.user.email : undefined;
        ctrl.collectionSearch = ctrl.filter.query ? ctrl.filter.query.indexOf('~') === 0 : false;

        $state.go('search.results', filter);
    }));

    $scope.$watch(() => ctrl.ordering.orderBy, onValChange(newVal => {
        $state.go('search.results', {orderBy: newVal});
    }));

    $scope.$watchCollection(() => ctrl.dateFilter, onValChange(({field, since, until}) => {
        // Translate dateFilter to actual state and query params
        $state.go('search.results', {
            since:         field === undefined  ? since : null,
            until:         field === undefined  ? until : null,
            takenSince:    field === 'taken'    ? since : null,
            takenUntil:    field === 'taken'    ? until : null,
            modifiedSince: field === 'modified' ? since : null,
            modifiedUntil: field === 'modified' ? until : null,
            dateField:     field
        });
    }));

    // we can't user dynamic values in the ng:true-value see:
    // https://docs.angularjs.org/error/ngModel/constexpr
    mediaApi.getSession().then(session => {
        ctrl.user = session.user;
        ctrl.filter.uploadedByMe = ctrl.uploadedBy === ctrl.user.email;

        if (ctrl.filter.nonFree === undefined) {
          ctrl.filter.nonFree = session.user.permissions.showPaid ?
            session.user.permissions.showPaid : undefined;
        }
    });

    function resetQuery() {
        ctrl.filter.query = undefined;
    }
}]);

query.directive('searchQuery', [function() {
    return {
        restrict: 'E',
        controller: 'SearchQueryCtrl as searchQuery',
        template: template
    };
}]);
