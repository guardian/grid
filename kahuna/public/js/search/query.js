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
import '../components/gr-sort-control/gr-extended-sort-control';
import '../components/gr-permissions-filter/gr-permissions-filter';
import '../components/gr-my-uploads/gr-my-uploads';
import { sendTelemetryForQuery } from '../services/telemetry';
import { renderQuery, structureQuery } from './structured-query/syntax';
import * as PermissionsConf from '../components/gr-permissions-filter/gr-permissions-filter-config';
import {updateFilterChips} from "../components/gr-permissions-filter/gr-permissions-filter-util";
import {
  manageSortSelection,
  DefaultSortOption,
  CollectionSortOption,
  HAS_DATE_TAKEN,
  TAKEN_SORT
} from "../components/gr-sort-control/gr-sort-control-config";
import {getFeatureSwitchActive} from "../components/gr-feature-switch-panel/gr-feature-switch-panel";

const toNonFreeString = (val) => (val === true || val === 'true') ? 'true' : 'false';
const isNonFreeString = (val) => val === 'true';

export var query = angular.module('kahuna.search.query', [
  // Note: temporarily disabled for performance reasons, see above
  // 'ngAnimate',
  eq.name,
  guDateRange.name,
  syntax.name,
  grStructuredQuery.name,
  'util.storage',
  'gr.sortControl',
  'gr.extendedSortControl',
  'gr.permissionsFilter',
  'gr.myUploads'
]);

query.controller('SearchQueryCtrl', [
  '$rootScope',
  '$scope',
  '$state',
  '$stateParams',
  '$timeout',
  'onValChange',
  'storage',
  'mediaApi',
  function($rootScope, $scope, $state, $stateParams, $timeout, onValChange, storage, mediaApi) {

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

    let lastRequestedOrderBy = $stateParams.orderBy;

    ctrl.filter = {
      uploadedByMe: false
    };

    ctrl.dateFilter = {
      // filled in by the watcher below
    };

    ctrl.usePermissionsFilter = window._clientConfig.usePermissionsFilter;
    ctrl.filterMyUploads = false;
    let lastUploadedByEventKey;
    ctrl.initialShowPaidEvent = ($stateParams.nonFree === undefined && ctrl.usePermissionsFilter) ? false : true;

    ctrl.shouldDisplayAISearchOption = getFeatureSwitchActive("enable-ai-search");
    if (!ctrl.shouldDisplayAISearchOption) {
      ctrl.useAISearch = false;
    } else {
      ctrl.useAISearch = ($stateParams.useAISearch === 'true' || $stateParams.useAISearch === true) ? true : false;
    }

    //--react - angular interop events--
    function raisePayableImagesEvent(showPaid) {
      const boolShowPaid = toNonFreeString(showPaid) === 'true';
      const customEvent = new CustomEvent('setPayableImages', {
        detail: {showPaid: boolShowPaid},
        bubbles: true
      });
      window.dispatchEvent(customEvent);
    }

    function raiseQueryChangeEvent(query, prevHasCollec, orderBy) {
      const customEvent = new CustomEvent('queryChangeEvent', {
        detail: {query: query, hasCollection: prevHasCollec, orderBy: orderBy},
        bubbles: true
      });
      window.dispatchEvent(customEvent);
    }

    function raiseFilterChangeEvent(filter) {
      const customEvent = new CustomEvent('filterChangeEvent', {
        detail: {filter: filter},
        bubbles: true
      });
      window.dispatchEvent(customEvent);
    }

    function raiseUploadedByCheckEvent() {
      if (ctrl.user) {
        const uploadedBy = ctrl.filter ? ctrl.filter.uploadedBy : undefined;
        const eventKey = `${ctrl.user.email}|${uploadedBy || ''}`;
        if (eventKey === lastUploadedByEventKey) {
          return;
        }
        lastUploadedByEventKey = eventKey;
        const customEvent = new CustomEvent('uploadedByEvent', {
          detail: { userEmail: ctrl.user.email, uploadedBy: uploadedBy },
          bubbles: true
        });
        window.dispatchEvent(customEvent);
      }
    }

    function manageUploadedBy(filter, sender) {
      // Users should be able to follow URLs with uploadedBy set to another user's name, so only
      // overwrite if:
      //   - uploadedBy is unset, or
      //   - uploadedBy is set to their email (to allow unchecking the 'My uploads' checkbox), or
      //   - 'My uploads' checkbox is checked (overwrite other user's email with theirs).
      if (!ctrl.usePermissionsFilter) {
        const myUploadsCheckbox = filter.uploadedByMe;
        const shouldOverwriteUploadedBy =
          !filter.uploadedBy || filter.uploadedBy === ctrl.user.email || myUploadsCheckbox;
        if (shouldOverwriteUploadedBy) {
          ctrl.filter.uploadedBy = filter.uploadedByMe ? ctrl.user.email : undefined;
        }
      } else {
        if (sender === "selectMyUploads") {
          const shouldOverwriteUploadedBy =
            !filter.uploadedBy ||
            filter.uploadedBy === (ctrl.user ? ctrl.user.email : undefined) ||
            ctrl.filterMyUploads;
          if (shouldOverwriteUploadedBy) {
            ctrl.filter.uploadedBy = (ctrl.user && ctrl.filterMyUploads) ? ctrl.user.email : undefined;
            ctrl.filter.uploadedByMe = ctrl.filterMyUploads;
          }
        }
        raiseUploadedByCheckEvent();
      }
      storage.setJs("isUploadedByMe", ctrl.filter.uploadedByMe, true);
    }

    // Guards the delayed disarming of the "pending default nonFree" flag,
    // see manageDefaultNonFree() below for why this is needed.
    let clearDefaultNonFreeFilterTimeout;

    function manageDefaultNonFree() {
      const defaultNonFreeFilter = storage.getJs("defaultNonFreeFilter", true);
      if (defaultNonFreeFilter && defaultNonFreeFilter.isDefault === true){
        const newNonFree = toNonFreeString(defaultNonFreeFilter.isNonFree);
        storage.setJs("isNonFree", newNonFree, true);
        storage.setJs("defaultIsNonFree", newNonFree, true);
        storage.setJs("isUploadedByMe", false, true);
        ctrl.filterMyUploads = false;
        if (ctrl.myUploadsProps) {
          syncMyUploadsProps();
        }
        ctrl.filter.orgOwned = false;
        Object.assign(ctrl.filter, {nonFree: newNonFree, uploadedByMe: false, uploadedBy: undefined});
        raiseFilterChangeEvent(ctrl.filter);

        // IMPORTANT: don't disarm the "isDefault" flag immediately here.
        // A single logo click triggers *several* back-to-back
        // navigations/filter-change digests (onLogoClick's own $state.go,
        // then gr-sort-control's handleLogoClick -> updateSortChips, and
        // sometimes a delayed, spurious transition fired by
        // ui-router-extras' Deep State Redirect mechanism that drops
        // params such as `nonFree` back to their state defaults).
        // If we disarm the flag on the very *first* of these passes
        // (which may just be an incidental/harmless one - e.g. the echo
        // of onLogoClick's own navigation - and not the actual rogue
        // transition we need to correct), this function becomes a no-op
        // for any later pass, so `nonFree` never gets corrected again if
        // the rogue transition drops it afterwards, leaving it stuck at
        // its non-default value. Instead, keep re-applying the default
        // on every pass for a short grace period after being armed, and
        // only disarm it once that period elapses.
        if (clearDefaultNonFreeFilterTimeout) {
          $timeout.cancel(clearDefaultNonFreeFilterTimeout);
        }
        clearDefaultNonFreeFilterTimeout = $timeout(() => {
          storage.setJs("defaultNonFreeFilter", {isDefault: false, isNonFree: newNonFree}, true);
          clearDefaultNonFreeFilterTimeout = undefined;
        }, 1500);
      }
    }

    $scope.$on('$destroy', () => {
      if (clearDefaultNonFreeFilterTimeout) {
        $timeout.cancel(clearDefaultNonFreeFilterTimeout);
      }
    });

    function manageOrgOwnedSetting(filter) {
      const structuredQuery = structureQuery(filter.query) || [];
      const orgOwnedIndexInQuery = structuredQuery.findIndex(item => item.value === ctrl.maybeOrgOwnedValue);
      const queryHasOrgOwned = orgOwnedIndexInQuery >= 0;
      if (ctrl.filter.orgOwned && !queryHasOrgOwned){
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
      } else if (!ctrl.filter.orgOwned && queryHasOrgOwned && !ctrl.usePermissionsFilter) {
        // If the checkbox is unticked, ensure chip is no longer in the search bar
        structuredQuery.splice(orgOwnedIndexInQuery, 1);
        ctrl.filter.query = renderQuery(structuredQuery);
      }
    }

    function resetQuery() {
      ctrl.filter.query = undefined;
      ctrl.filter.orgOwned = false;
    }

    function checkForCollection(query) {
      return /~"[a-zA-Z0-9 #-_.://]+"/.test(query);
    }

    function storeCollection(query) {
      const match = query ? query.match(/~"[a-zA-Z0-9 #-_.://]+"/) : undefined;
      const collection = match ? match[0] : "";
      storage.setJs("currentCollection", collection);
      return collection;
    }

    function getCollection() {
      return storage.getJs("currentCollection") ? storage.getJs("currentCollection") : "";
    }

    function getPriorOrderBy() {
      return storage.getJs("priorOrderBy") ? storage.getJs("priorOrderBy") : "";
    }

    function setPriorOrderBy(priorOrderBy) {
      storage.setJs("priorOrderBy", priorOrderBy);
    }

    function revisedOrderBy(collectionSearch) {
      if (collectionSearch) {
        return CollectionSortOption.value;
      } else {
        return DefaultSortOption.value;
      }
    }

    function priorRevisedOrderBy(collectionSearch, newCollection, oldCollection) {
      const priorOrderBy = getPriorOrderBy();
      if (collectionSearch && ((oldCollection !== newCollection) || ("" !== priorOrderBy))) {
        if (priorOrderBy !== "") {
          setPriorOrderBy("");
          return priorOrderBy;
        } else {
          setPriorOrderBy(CollectionSortOption.value);
          return null;
        }
      } else {
        return null;
      }
    }

    // eslint-disable-next-line complexity
    function watchSearchChange(newFilter, sender) {
      let showPaid = toNonFreeString(newFilter.nonFree);
      if (ctrl.usePermissionsFilter && sender && sender === "filterChange" && newFilter.nonFree === undefined) {
        showPaid = toNonFreeString(ctrl.user.permissions.showPaid);
      }
      storage.setJs("isNonFree", showPaid, true);

      // check for taken date sort contradiction
      const curCollectionSearch = ctrl.collectionSearch;
      ctrl.collectionSearch = newFilter.query ? checkForCollection(newFilter.query) : false;
      const oldCollection = getCollection();
      const newCollection = storeCollection(newFilter.query);

      if (ctrl.usePermissionsFilter) {
        if (sender && ctrl.ordering["orderBy"] !== $stateParams.orderBy) {
          ctrl.ordering["orderBy"] = $stateParams.orderBy;
        }
        if ($stateParams.orderBy && $stateParams.orderBy.includes(TAKEN_SORT) && (!newFilter.query || !newFilter.query.includes(HAS_DATE_TAKEN))) {
          ctrl.ordering["orderBy"] = revisedOrderBy(ctrl.collectionSearch);
        } else {
          const prior = priorRevisedOrderBy(ctrl.collectionSearch, newCollection, oldCollection);
          ctrl.ordering["orderBy"] = prior ? prior : ctrl.ordering["orderBy"];
        }
      }
      let sortBy = ctrl.ordering["orderBy"] ? ctrl.ordering["orderBy"] : DefaultSortOption.value;
      storage.setJs("orderBy", sortBy);

      //--update filter elements--
      manageUploadedBy(newFilter, sender);
      manageDefaultNonFree();
      manageOrgOwnedSetting(newFilter);

      const { uploadedByMe } = ctrl.filter;
      // Normalise to string immediately to prevent boolean/string oscillation from ui-router URL decode
      const incomingNonFree = newFilter.nonFree !== undefined ? toNonFreeString(newFilter.nonFree) : undefined;
      let nonFreeCheck = incomingNonFree !== undefined ? incomingNonFree : ctrl.filter.nonFree;
      if (ctrl.usePermissionsFilter && nonFreeCheck === undefined) {
        const defaultShowPaid = storage.getJs("defaultIsNonFree", true);
        nonFreeCheck = defaultShowPaid === 'true' ? 'true' : 'false';
      } else if (!ctrl.usePermissionsFilter && nonFreeCheck === 'false') {
        nonFreeCheck = undefined;
      }
      ctrl.filter.nonFree = nonFreeCheck;

      sendTelemetryForQuery(ctrl.filter.query, nonFreeCheck, uploadedByMe);

      function normaliseParamForComparison(key, val) {
        if (key === 'nonFree' && !ctrl.usePermissionsFilter && val === 'false') {
          return undefined;
        }
        // treat '' and undefined as equivalent to avoid false negatives
        return val || undefined;
      }

      function goParamsAlreadyCurrent(goParams) {
        return Object.keys(goParams).every(key => {
          const a = normaliseParamForComparison(key, goParams[key]);
          const b = normaliseParamForComparison(key, $stateParams[key]);
          return a === b;
        });
      }

      function isOrderByOnlyCorrection(goParams) {
        return Object.keys(goParams).every(key => {
          if (key === 'orderBy') { return true; }
          const a = normaliseParamForComparison(key, goParams[key]);
          const b = normaliseParamForComparison(key, $stateParams[key]);
          return a === b;
        });
      }

      if (ctrl.collectionSearch && !curCollectionSearch) {
        storage.setJs("orderBy", CollectionSortOption.value);
        ctrl.ordering["orderBy"] = CollectionSortOption.value;
        // Record synchronously *before* the ctrl.ordering.orderBy $watch can
        // run in this same digest, so it recognises this orderBy change as
        // already handled and doesn't fire its own extra navigation.
        lastRequestedOrderBy = CollectionSortOption.value;
        const goParams1 = {...ctrl.filter, ...{orderBy: CollectionSortOption.value}};
        if (!goParamsAlreadyCurrent(goParams1)) {
          raiseQueryChangeEvent(ctrl.filter.query, curCollectionSearch, CollectionSortOption.value);
          const options1 = isOrderByOnlyCorrection(goParams1) ? {location: 'replace'} : undefined;
          $state.go('search.results', goParams1, options1);
        }
      } else {
        lastRequestedOrderBy = ctrl.ordering["orderBy"];
        const goParams2 = {...ctrl.filter, ...{orderBy: ctrl.ordering["orderBy"]}};
        if (!goParamsAlreadyCurrent(goParams2)) {
          raiseQueryChangeEvent(ctrl.filter.query, curCollectionSearch, ctrl.ordering["orderBy"]);
          const options2 = isOrderByOnlyCorrection(goParams2) ? {location: 'replace'} : undefined;
          $state.go('search.results', goParams2, options2);
        }
      }
    }

    //-my uploads-
    function syncMyUploadsProps() {
      ctrl.myUploadsProps = {
        ...ctrl.myUploadsProps,
        myUploads: ctrl.filterMyUploads
      };
    }

    function selectMyUploads(myUploadsChecked) {
      ctrl.filterMyUploads = myUploadsChecked;
      syncMyUploadsProps();
      watchSearchChange(ctrl.filter, "selectMyUploads");
    }

    ctrl.myUploadsProps = {
      myUploads: ctrl.filterMyUploads,
      onChange: selectMyUploads
    };
    //-end my uploads

    //-sort control-
    function updateSortChips (sortSel) {
      ctrl.ordering['orderBy'] = manageSortSelection(sortSel.value);
      storage.setJs("orderBy", ctrl.ordering["orderBy"]);

      lastRequestedOrderBy = ctrl.ordering['orderBy'];
      $state.go('search.results', {orderBy: ctrl.ordering['orderBy']});
    }

    ctrl.sortProps = {
      onSortSelect: updateSortChips,
      query: $stateParams.query,
      orderBy: ctrl.ordering ? ctrl.ordering.orderBy : ""
    };

    // Keep the React sort-control's props in sync with the underlying model.
    // A *new* object reference is required each time, since react2angular's
    // one-way ('<') binding only re-renders when the bound reference changes.
    $scope.$watch(
      () => `${ctrl.ordering.orderBy}||${ctrl.filter.query}`,
      onValChange(() => {
        ctrl.sortProps = {
          ...ctrl.sortProps,
          query: ctrl.filter.query,
          orderBy: ctrl.ordering.orderBy
        };
      })
    );
    //-end sort control-

    //-permissions filter-
    function updatePermissionsChips (permissionsSel, showChargeable) {
      ctrl.permissionsProps.selectedOption = permissionsSel;
      ctrl.filter.query = updateFilterChips(permissionsSel, ctrl.filter.query);
      ctrl.filter.nonFree = toNonFreeString(showChargeable);
      watchSearchChange(ctrl.filter, "updatePermissionsChips");
    }

    function chargeableChange (showChargeable) {
      ctrl.filter.nonFree = toNonFreeString(showChargeable);
      watchSearchChange(ctrl.filter, "chargeableChange");
    }

    let pfOpts = PermissionsConf.permissionsOptions();
    let defOptVal = PermissionsConf.permissionsDefaultOpt();
    let pfDefPerm = pfOpts.filter(opt => opt.value == defOptVal)[0];
    ctrl.permissionsProps = { options: pfOpts,
      selectedOption: pfDefPerm,
      onSelect: updatePermissionsChips,
      onChargeable: chargeableChange,
      chargeable: toNonFreeString(ctrl.filter.nonFree || $stateParams.nonFree) === "true",
      query: ctrl.filter.query
    };

    // Keep the React permissions-filter's props in sync with the underlying
    // model (e.g. after a reset via onLogoClick or the back button), for the
    // same reason as ctrl.sortProps above: react2angular's one-way binding
    // only re-renders on a *new* object reference.
    $scope.$watch(
      () => `${ctrl.filter.nonFree}||${ctrl.filter.query}`,
      onValChange(() => {
        ctrl.permissionsProps = {
          ...ctrl.permissionsProps,
          chargeable: toNonFreeString(ctrl.filter.nonFree) === "true",
          query: ctrl.filter.query
        };
      })
    );
    //-end permissions filter-

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

      ctrl.collectionSearch = ctrl.filter.query ?  checkForCollection(ctrl.filter.query) : false;
      storeCollection(ctrl.filter.query);

      $scope.$watch(() => $stateParams[key], onValChange(newVal => {
        // FIXME: broken for 'your uploads'
        // FIXME: + they triggers filter $watch and $state.go (breaks history)
        if (key !== 'orderBy') {
          // For nonFree, ensure boolean true from URL decode is normalised to string 'true'
          const val = valOrUndefined(newVal);
          ctrl.filter[key] = (key === 'nonFree' && val !== undefined) ? toNonFreeString(val) : val;
        } else {
          ctrl.ordering.orderBy = valOrUndefined(newVal);
        }

        if (key === 'query') {
          const sq = structureQuery(valOrUndefined(newVal)) || [];
          ctrl.filter.orgOwned = sq.some(item => item.value === ctrl.maybeOrgOwnedValue);
        }

        // When uploadedBy changes externally (e.g. back button), sync uploadedByMe
        // and filterMyUploads so manageUploadedBy doesn't re-set uploadedBy.
        if (key === 'uploadedBy') {
          const isMyUploads = ctrl.user ? valOrUndefined(newVal) === ctrl.user.email : false;
          ctrl.filter.uploadedByMe = isMyUploads;
          ctrl.filterMyUploads = isMyUploads;
          syncMyUploadsProps();
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

    $scope.$watchCollection(() => ctrl.filter, onValChange(newFilter => {
      watchSearchChange(newFilter, "filterChange");
    }));

    $scope.$watch(() => ctrl.ordering.orderBy, onValChange(newVal => {
      if ($stateParams.orderBy === newVal || lastRequestedOrderBy === newVal) {
        return;
      }
      lastRequestedOrderBy = newVal;
      const stateGoParams = {...ctrl.filter, orderBy: newVal};
      $state.go('search.results', stateGoParams);
    }));

    $scope.$watch(() => ctrl.useAISearch, () => {
      // Note: $watch expressions execute at least once during initialization, so this is executed on page refresh.
      // This is the behaviour we want so that the URL is updated based on the AI search toggle
      if (ctrl.useAISearch) {
        $state.go('search.results', {
          ...ctrl.filter,
          useAISearch: true
        });
      } else {
        $state.go('search.results', {...ctrl.filter,  useAISearch: undefined});
      }
    });

    $scope.$watchCollection(() => ctrl.dateFilter, onValChange(({field, since, until}) => {
      // Translate dateFilter to actual state and query params
      $state.go('search.results', {...ctrl.filter, ...{
          since:         field === undefined  ? since : null,
          until:         field === undefined  ? until : null,
          takenSince:    field === 'taken'    ? since : null,
          takenUntil:    field === 'taken'    ? until : null,
          modifiedSince: field === 'modified' ? since : null,
          modifiedUntil: field === 'modified' ? until : null,
          dateField:     field
        }});
    }));

    // we can't user dynamic values in the ng:true-value see:
    // https://docs.angularjs.org/error/ngModel/constexpr
    mediaApi.getSession().then(session => {
      //-uploaded by me-
      const isUploadedByMe = storage.getJs("isUploadedByMe", true);
      ctrl.user = session.user;
      if (ctrl.filter.uploadedBy === ctrl.user.email) {
        ctrl.filter.uploadedByMe = true;
        ctrl.filterMyUploads = true;
        storage.setJs("isUploadedByMe", true);
      } else if (isUploadedByMe === null) {
        ctrl.filter.uploadedByMe = ctrl.filter.uploadedBy === ctrl.user.email;
        ctrl.filterMyUploads = ctrl.filter.uploadedByMe;
        storage.setJs("isUploadedByMe",ctrl.filter.uploadedByMe);
      } else {
        if ((ctrl.filter.uploadedBy === ctrl.user.email) && !isUploadedByMe ) {
          ctrl.filter.uploadedByMe = true;
          ctrl.filterMyUploads = ctrl.filter.uploadedByMe;
          storage.setJs("isUploadedByMe",ctrl.filter.uploadedByMe);
        } else {
          ctrl.filter.uploadedByMe = isUploadedByMe;
          ctrl.filterMyUploads = isUploadedByMe;
        }
      }

      syncMyUploadsProps();
      raiseUploadedByCheckEvent();

      //-default non free-
      const defNonFree = session.user.permissions ? session.user.permissions.showPaid : undefined;
      storage.setJs("defaultIsNonFree", toNonFreeString(defNonFree), true);
      if (!ctrl.initialShowPaidEvent && toNonFreeString(defNonFree) === 'true') {
        ctrl.initialShowPaidEvent = true;
        raisePayableImagesEvent(defNonFree);
      }

      // If nonFree is provided in URL params, use that; otherwise use stored value
      if ($stateParams.nonFree !== undefined) {
        ctrl.filter.nonFree = toNonFreeString($stateParams.nonFree);
        storage.setJs("isNonFree", ctrl.filter.nonFree, true);
      } else {
        const isNonFree = storage.getJs("isNonFree", true);
        if (isNonFree === null) {
          ctrl.filter.nonFree = toNonFreeString($stateParams.nonFree);
          storage.setJs("isNonFree", ctrl.filter.nonFree, true);
        } else {
          ctrl.filter.nonFree = isNonFreeString(isNonFree) ? 'true' : 'false';
        }
      }

      //-org owned-
      const structuredQuery = structureQuery(ctrl.filter.query);
      const orgOwned = (structuredQuery.some(item => item.value === ctrl.maybeOrgOwnedValue));
      ctrl.filter.orgOwned = orgOwned;

      watchSearchChange(ctrl.filter, "userPermissions");
    });

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
