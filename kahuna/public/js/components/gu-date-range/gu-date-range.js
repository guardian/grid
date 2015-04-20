import angular from 'angular';
import moment from 'moment';
import Pikaday from 'pikaday';

import template from './gu-date-range.html!text';

import 'pikaday/css/pikaday.css!';
import './gu-date-range.css!';
import './pikaday-override.css!';

export var guDateRange = angular.module('gu-dateRange', []);

guDateRange.directive('guDateRange', [function () {
    return {
        template: template,
        replace: true,
        scope: {
            guStartDate: '=guStartDate',
            guEndDate: '=guEndDate',
            guPresetDates: '=guPresetDates',
            guDateFormat: '=?guDateFormat',
            guAnyTimeText: '=?guAnyTimeText',
            guFirstDay: '=?guFirstDay'
        },
        link: function ($scope, el) {
            $scope.guDateFormat = $scope.guDateFormat || 'DD-MMM-YYYY';
            $scope.guAnyTimeText = $scope.guAnyTimeText || 'anytime';
            $scope.guFirstDay = $scope.guFirstDay || 0;

            var startInput = el.find('.gu-date-range__input__start--hidden')[0];
            var startContainer = el.find('.gu-date-range__overlay__pikaday--start')[0];

            var endInput = el.find('.gu-date-range__input__end--hidden')[0];
            var endContainer = el.find('.gu-date-range__overlay__pikaday--end')[0];

            var pikaStart = new Pikaday({
                field: startInput,
                container: startContainer,
                bound: false,
                maxDate: new Date(),
                firstDay: parseInt($scope.guFirstDay),
                onSelect: function () {
                    var otherPika = pikaEnd;
                    var value = this.getDate();

                    otherPika.setMinDate(value);
                    otherPika.hide();
                    otherPika.show();
                }
            });

            var pikaEnd = new Pikaday({
                field: endInput,
                container: endContainer,
                bound: false,
                maxDate: new Date(),
                firstDay: parseInt($scope.guFirstDay),
                onSelect: function () {
                    var otherPika = pikaStart;
                    var value = this.getDate();

                    otherPika.setMaxDate(value);
                    otherPika.hide();
                    otherPika.show();
                }
            });

            function _clearPikadays(primary, secondary) {
                primary.setDate(undefined, true);

                secondary.setMinDate();
                secondary.setMaxDate(new Date());
                secondary.hide();
                secondary.show();
            };

            function setDisplayValue (start, end) {
                if (angular.isDefined(start)) {
                    $scope.startValue = moment(start).format($scope.guDateFormat);
                    pikaStart.setDate(start);
                } else {
                    $scope.startValue = $scope.guAnyTimeText;
                    _clearPikadays(pikaStart, pikaEnd);
                }

                if (angular.isDefined(end)) {
                    $scope.endValue = moment(end).format($scope.guDateFormat);
                    pikaEnd.setDate(end);
                } else {
                    $scope.endValue = undefined;
                    _clearPikadays(pikaEnd, pikaStart);
                }
            };

            function setDateRange (start, end) {
                $scope.guStartDate = angular.isDefined(start)
                    ? moment(start).toISOString()
                    : undefined;

                $scope.guEndDate = angular.isDefined(end)
                    ? moment(end).toISOString()
                    : undefined;

                setDisplayValue(start, end);
            };

            function closeOverlay () {
                $scope.showOverlay = false;
            };

            function reset() {
                setDateRange($scope.guStartDate, $scope.guEndDate);
            };

            function cancel () {
                reset();
                closeOverlay();
            };

            function save () {
                var start = pikaStart.getDate();
                start = start ? moment(start).startOf('day').toDate() : undefined;

                var end = pikaEnd.getDate();
                end = end ? moment(end).endOf('day').toDate() : undefined;

                setDateRange(start, end);
                closeOverlay();
            };

            function setPresetDate (preset) {
                setDateRange(preset, undefined);
                closeOverlay();
            };

            function clearStart () {
                _clearPikadays(pikaStart, pikaEnd);
                pikaStart.gotoToday();
            };

            function clearEnd () {
                _clearPikadays(pikaEnd, pikaStart);
                pikaEnd.gotoToday();
            };

            $scope.cancel = cancel;
            $scope.save = save;
            $scope.setPresetDate = setPresetDate;
            $scope.clearStart = clearStart;
            $scope.clearEnd = clearEnd;

            reset();
        }
    };
}]);
