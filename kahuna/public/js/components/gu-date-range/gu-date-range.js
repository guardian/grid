import angular from 'angular';
import moment from 'moment';
import Pikaday from 'pikaday';
import 'pikaday/css/pikaday.css';

import template from './gu-date-range.html';

import './gu-date-range.css';
import './pikaday-override.css';

export var guDateRange = angular.module('gu-dateRange', []);

guDateRange.controller('GuDateRangeCtrl', [function () {
    function getDateISOString (val) {
        return angular.isDefined(val) ? moment(val).toISOString() : undefined;
    }

    const ctrl = this;

    ctrl.trackingName = 'Date Picker';

    ctrl.setDateRangeForDisplay = function () {
        ctrl.guDisplayStartDate = angular.isDefined(ctrl.guStartDate) ?
            moment(ctrl.guStartDate).format(ctrl.guDateFormat) :
            ctrl.guAnyTimeText;

        ctrl.guDisplayEndDate = angular.isDefined(ctrl.guEndDate) ?
            moment(ctrl.guEndDate).format(ctrl.guDateFormat) :
            undefined;

        ctrl.guDisplayField = ctrl.guSelectedField;
    };

    ctrl.setDateRange = function (start, end) {
        ctrl.guStartDate = getDateISOString(start);
        ctrl.guEndDate = getDateISOString(end);
        ctrl.guSelectedField = ctrl.guDisplayField;
    };

    ctrl.closeOverlay = () => {
        ctrl.showOverlay = false;
    };

    ctrl.save = function (start, end) {
        ctrl.setDateRange(start, end);
        ctrl.setDateRangeForDisplay();
        ctrl.closeOverlay();
    };
}]);

guDateRange.directive('guDateRange', [function () {
    return {
        template: template,
        replace: true,
        scope: {
          guStartDate: '=',
          guEndDate: '=',
          guPresetDates: '=',
          guSelectedField: '=',
          guFields: '=',
          guDateFormat: '=?',
          guAnyTimeText: '=?',
          guFirstDay: '=?',
          guShowExtras: '='
        },
        controller: 'GuDateRangeCtrl',
        controllerAs: 'ctrl',
        bindToController: true,

        link: function ($scope, el, attrs, ctrl) {
          ctrl.guDateFormat = ctrl.guDateFormat || 'DD-MMM-YYYY';
          ctrl.guAnyTimeText = ctrl.guAnyTimeText || 'anytime';
          ctrl.guFirstDay = ctrl.guFirstDay || 0;
          const originalEl = el[0];
          var startInput = originalEl
            .querySelectorAll('.gu-date-range__input__start--hidden')[0];
          var startContainer = originalEl
            .querySelectorAll('.gu-date-range__overlay__pikaday--start')[0];

          var endInput = originalEl
            .querySelectorAll('.gu-date-range__input__end--hidden')[0];
          var endContainer = originalEl
            .querySelectorAll('.gu-date-range__overlay__pikaday--end')[0];


          const tenYearsInMilliseconds = (10 * 365 * 24 * 60 * 60 * 1000);
          const tenYearsFromNow =  new Date(Date.now() + tenYearsInMilliseconds);

          var pikaStart = new Pikaday({
              field: startInput,
              container: startContainer,
              bound: false,
              maxDate: tenYearsFromNow,
              yearRange: 100,
              firstDay: parseInt(ctrl.guFirstDay),
              format: ctrl.guDateFormat,
              keyboardInput: false
          });

          var pikaEnd = new Pikaday({
              field: endInput,
              container: endContainer,
              bound: false,
              maxDate: tenYearsFromNow,
              firstDay: parseInt(ctrl.guFirstDay),
              format: ctrl.guDateFormat,
              yearRange: 100,
              keyboardInput: false
          });

          $scope.$watch('pikaStartValue', function (pikaStartValue) {
              var date = (pikaStartValue && new Date(pikaStartValue)) || new Date();
              pikaEnd.setMinDate(date);
              pikaEnd.hide();
              pikaEnd.show();
          });

          $scope.$watch('pikaEndValue', function () {
              pikaStart.hide();
              pikaStart.show();
          });

          $scope.$watch('ctrl.guEndDate',   resetView);

          $scope.$on('$destroy', function() {
              pikaStart.destroy();
              pikaEnd.destroy();
          });

          function resetView() {
              ctrl.setDateRangeForDisplay();

              pikaStart.setDate();
              pikaEnd.setDate();

              pikaStart.setDate(ctrl.guStartDate);
              pikaEnd.setDate(ctrl.guEndDate);

              ctrl.closeOverlay();
          }

          function getStartValue () {
              var start = pikaStart.getDate();
              return start ? moment(start).startOf('day').toDate() : undefined;
          }

          function getEndValue () {
              var end = pikaEnd.getDate();
              return end ? moment(end).endOf('day').toDate() : undefined;
          }

          function setPresetDate (preset) {
              ctrl.save(preset);
              resetView();
          }

          function setCustomRange () {
              var start = getStartValue();
              var end = getEndValue();

              ctrl.save(start, end);
              resetView();
          }

          function clearStart () {
              pikaStart.setDate();
              pikaStart.gotoToday();
          }

          function clearEnd () {
              pikaEnd.setDate();
              pikaEnd.gotoToday();
          }

          $scope.cancel = resetView;
          $scope.save = setCustomRange;
          $scope.setPresetDate = setPresetDate;
          $scope.clearStart = clearStart;
          $scope.clearEnd = clearEnd;

          resetView();
        }
    };
}]);
