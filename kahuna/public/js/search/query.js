import angular from 'angular';
// FIXME: used to fade 'x' query clear button, but disabled as it ends
// up being enabled globally and severely degrades the performance of
// the lazy-table for results. Once there is a working way to disable
// animations locally, we should turn it back on here.
// import 'angular-animate';
import moment from 'moment';
import {eq} from '../util/eq';
import '../util/storage';
import {guDateRange} from '../components/gu-date-range/gu-date-range';
import template from './query.html';
import {syntax} from './syntax/syntax';
import {grStructuredQuery} from './structured-query/structured-query';
import '../components/gr-sort-control/gr-sort-control';
import { sendTelemetryForQuery } from '../services/telemetry';
import { renderQuery, structureQuery } from './structured-query/syntax';
import {
  manageSortSelection,
  DefaultSortOption
} from "../components/gr-sort-control/gr-sort-control-config";

export var query = angular.module('kahuna.search.query', [
    // Note: temporarily disabled for performance reasons, see above
    // 'ngAnimate',
    eq.name,
    guDateRange.name,
    syntax.name,
    grStructuredQuery.name,
    'util.storage',
    'gr.sortControl'
]);

query.controller('SearchQueryCtrl', [
  '$rootScope',
  '$scope',
  '$state',
  '$stateParams',
  'onValChange',
  'storage',
  'mediaApi',
  function($rootScope, $scope, $state, $stateParams, onValChange, storage, mediaApi) {

    const ctrl = this;
    ctrl.costFilterLabel = window._clientConfig.costFilterLabel;
    ctrl.costFilterChargeable = window._clientConfig.costFilterChargeable;
    ctrl.costFilterFalseValue =  ctrl.costFilterChargeable ? undefined : "'true'";
    ctrl.costFilterTrueValue =  ctrl.costFilterChargeable ? "'true'" : undefined;
    ctrl.maybeOrgOwnedValue = window._clientConfig.maybeOrgOwnedValue;

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

    function watchUploadedBy(filter) {
      // Users should be able to follow URLs with uploadedBy set to another user's name, so only
      // overwrite if:
      //   - uploadedBy is unset, or
      //   - uploadedBy is set to their email (to allow unchecking the 'My uploads' checkbox), or
      //   - 'My uploads' checkbox is checked (overwrite other user's email with theirs).
      const myUploadsCheckbox = filter.uploadedByMe;
      const shouldOverwriteUploadedBy =
        !filter.uploadedBy || filter.uploadedBy === ctrl.user.email || myUploadsCheckbox;
      if (shouldOverwriteUploadedBy) {
        filter.uploadedBy = filter.uploadedByMe ? ctrl.user.email : undefined;
      }
      storage.setJs("isUploadedByMe", ctrl.filter.uploadedByMe, true);
    }

    function raiseQueryChangeEvent(q) {
      const customEvent = new CustomEvent('queryChangeEvent', {
        detail: {query: q},
        bubbles: true
      });
      window.dispatchEvent(customEvent);
    }

    function watchSearchChange(filter) {
      const showPaid = ctrl.filter.nonFree ? ctrl.filter.nonFree : false;
      storage.setJs("isNonFree", showPaid, true);

      ctrl.collectionSearch = ctrl.filter.query ? ctrl.filter.query.indexOf('~') === 0 : false;
      watchUploadedBy(filter);
      raiseQueryChangeEvent(ctrl.filter.query);

      const defaultNonFreeFilter = storage.getJs("defaultNonFreeFilter", true);
      if (defaultNonFreeFilter && defaultNonFreeFilter.isDefault === true){
        let newNonFree = defaultNonFreeFilter.isNonFree ? "true" : undefined;
        if (newNonFree !== filter.nonFree){
          storage.setJs("isNonFree", newNonFree ? newNonFree : false, true);
          storage.setJs("isUploadedByMe", false, true);
          storage.setJs("defaultNonFreeFilter", {isDefault: false, isNonFree: false}, true);
          ctrl.filter.orgOwned = false;
        }
        Object.assign(filter, {nonFree: newNonFree, uploadedByMe: false, uploadedBy: undefined});
      }

      const structuredQuery = structureQuery(filter.query) || [];
      const orgOwnedIndexInQuery = structuredQuery.findIndex(item => item.value === ctrl.maybeOrgOwnedValue);
      const queryHasOrgOwned = orgOwnedIndexInQuery >= 0;
      if (filter.orgOwned && !queryHasOrgOwned){
        // If the checkbox is ticked, ensure the chip is part of the search bar
        const orgOwnedChip = {
          type: "filter",
          filterType: "inclusion",
          key : "is",
          value: ctrl.maybeOrgOwnedValue
        };
        ctrl.filter.query = renderQuery([
          ...structuredQuery,
          orgOwnedChip
        ]);
      } else if (!filter.orgOwned && queryHasOrgOwned) {
        // If the checkbox is unticked, ensure chip is no longer in the search bar
        structuredQuery.splice(orgOwnedIndexInQuery, 1);
        ctrl.filter.query = renderQuery(structuredQuery);
      }

      const { nonFree, uploadedByMe } = ctrl.filter;
      const nonFreeCheck = nonFree;
      ctrl.filter.nonFree = nonFreeCheck;
      sendTelemetryForQuery(ctrl.filter.query, nonFreeCheck, uploadedByMe);
      $state.go('search.results', filter);
    }

    //-sort control-
    function updateSortChips (sortSel) {
      ctrl.sortProps.selectedOption = sortSel;
      ctrl.ordering['orderBy'] = manageSortSelection(sortSel.value);
      watchSearchChange(ctrl.filter);
    }

    ctrl.sortProps = {
      selectedOption: DefaultSortOption,
      onSelect: updateSortChips,
      query: ctrl.filter.query,
      orderBy: ctrl.ordering ? ctrl.ordering.orderBy : ""
    };
    //-end sort control-

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


    // eslint-disable-next-line complexity
    $scope.$watchCollection(() => ctrl.filter, onValChange(watchSearchChange));

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
        const isNonFree = storage.getJs("isNonFree", true);
        const isUploadedByMe = storage.getJs("isUploadedByMe", true);
        const structuredQuery = structureQuery(ctrl.filter.query);
        const orgOwned = (structuredQuery.some(item => item.value === ctrl.maybeOrgOwnedValue));
        ctrl.user = session.user;
        if (isUploadedByMe === null) {
              ctrl.filter.uploadedByMe = ctrl.uploadedBy === ctrl.user.email;
              storage.setJs("isUploadedByMe",ctrl.filter.uploadedByMe);
        }
        else {
          ctrl.filter.uploadedByMe =  isUploadedByMe;
        }

        if (isNonFree === null) {
          ctrl.filter.nonFree = $stateParams.nonFree;
          storage.setJs("isNonFree", ctrl.filter.nonFree ? ctrl.filter.nonFree : false, true);
        }
        else if (isNonFree === true || isNonFree === "true") {
            ctrl.filter.nonFree = "true";
        } else {
          ctrl.filter.nonFree = undefined;
        }
        ctrl.filter.orgOwned = orgOwned;
    });

    function resetQuery() {
        ctrl.filter.query = undefined;
        ctrl.filter.orgOwned = false;
    }

    const { nonFree, uploadedByMe } = ctrl.filter;
    sendTelemetryForQuery(ctrl.filter.query, nonFree, uploadedByMe);
}]);

query.directive('searchQuery', [function() {
    return {
        restrict: 'E',
        controller: 'SearchQueryCtrl as searchQuery',
        template: template
    };
}]);
