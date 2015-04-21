import angular from 'angular';
import moment from 'moment';
import Pikaday from 'pikaday';

import template from './gu-date-range.html!text';

import './gu-date-range.css!';
import './pikaday-override.css!';

export var guDateRange = angular.module('gu-dateRange', []);

guDateRange.controller('GuDateRangeCtrl', [function () {
    function getDateISOString (val) {
        return angular.isDefined(val) ? moment(val).toISOString() : undefined;
    };

    var ctrl = this;

    ctrl.setDateRangeForDisplay = function () {
        ctrl.guDisplayStartDate = angular.isDefined(ctrl.guStartDate)
            ? moment(ctrl.guStartDate).format(ctrl.guDateFormat)
            : ctrl.guAnyTimeText;

        ctrl.guDisplayEndDate = angular.isDefined(ctrl.guEndDate)
            ? moment(ctrl.guEndDate).format(ctrl.guDateFormat)
            : undefined;
    };

    ctrl.setDateRange = function (start, end) {
        ctrl.guStartDate = getDateISOString(start);
        ctrl.guEndDate = getDateISOString(end);
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
            guDateFormat: '=?',
            guAnyTimeText: '=?',
            guFirstDay: '=?'
        },
        controller: 'GuDateRangeCtrl',
        controllerAs: 'ctrl',
        bindToController: true,

        link: function ($scope, el, attrs, ctrl) {
            ctrl.guDateFormat = ctrl.guDateFormat || 'DD-MMM-YYYY';
            ctrl.guAnyTimeText = ctrl.guAnyTimeText || 'anytime';
            ctrl.guFirstDay = ctrl.guFirstDay || 0;

            var startInput = el.find('.gu-date-range__input__start--hidden')[0];
            var startContainer = el.find('.gu-date-range__overlay__pikaday--start')[0];

            var endInput = el.find('.gu-date-range__input__end--hidden')[0];
            var endContainer = el.find('.gu-date-range__overlay__pikaday--end')[0];

            var iso8601Format = 'YYYY-MM-DDTHH:mm:ssZ';

            var pikaStart = new Pikaday({
                field: startInput,
                container: startContainer,
                bound: false,
                maxDate: new Date(),
                firstDay: parseInt(ctrl.guFirstDay),
                format: iso8601Format
            });

            var pikaEnd = new Pikaday({
                field: endInput,
                container: endContainer,
                bound: false,
                maxDate: new Date(),
                firstDay: parseInt(ctrl.guFirstDay),
                format: iso8601Format
            });

            $scope.$watch('pikaStartValue', function (pikaStartValue) {
                var date = pikaStartValue && new Date(pikaStartValue);
                pikaEnd.setMinDate(date);
                pikaEnd.hide();
                pikaEnd.show();
            });

            $scope.$watch('pikaEndValue', function (pikaEndValue) {
                var date = pikaEndValue && new Date(pikaEndValue);
                pikaStart.setMaxDate(date || new Date());
                pikaStart.hide();
                pikaStart.show();
            });

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
            };

            function getStartValue () {
                var start = pikaStart.getDate();
                return start ? moment(start).startOf('day').toDate() : undefined;
            };

            function getEndValue () {
                var end = pikaEnd.getDate();
                return end ? moment(end).endOf('day').toDate() : undefined;
            };

            function setPresetDate (preset) {
                ctrl.save(preset);
                resetView();
            };

            function setCustomRange () {
                var start = getStartValue();
                var end = getEndValue();

                ctrl.save(start, end);
                resetView();
            }

            function clearStart () {
                pikaStart.setDate();
                pikaStart.gotoToday();
            };

            function clearEnd () {
                pikaEnd.setDate();
                pikaEnd.gotoToday();
            };

            $scope.cancel = resetView;
            $scope.save = setCustomRange;
            $scope.setPresetDate = setPresetDate;
            $scope.clearStart = clearStart;
            $scope.clearEnd = clearEnd;

            resetView();
        }
    };
}]);
