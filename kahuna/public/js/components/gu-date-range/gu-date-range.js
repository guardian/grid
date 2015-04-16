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
            guPresetDates: '=guPresetDates'
        },
        link: function ($scope, el) {
            var startInput = el.find('#filter__input__start--hidden')[0];
            var startContainer = el.find('#filter__modal__pikaday--start')[0];

            var endInput = el.find('#filter__input__end--hidden')[0];
            var endContainer = el.find('#filter__modal__pikaday--end')[0];

            var pikaStart = new Pikaday({
                field: startInput,
                container: startContainer,
                bound: false,
                maxDate: new Date(),
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
                onSelect: function () {
                    var otherPika = pikaStart;
                    var value = this.getDate();

                    otherPika.setMaxDate(value);
                    otherPika.hide();
                    otherPika.show();
                }
            });

            function setDisplayValue (start, end) {
                if (start !== undefined) {
                    $scope.startValue = moment(start).format('DD-MMM-YYYY');
                    pikaStart.setDate(start);
                } else {
                    $scope.startValue = 'anytime';
                    pikaStart.setDate(start, true);
                    pikaEnd.setMinDate();
                    pikaEnd.setMaxDate(new Date());
                    pikaEnd.hide();
                    pikaEnd.show();
                }

                if (end !== undefined) {
                    $scope.endValue = moment(end).format('DD-MMM-YYYY');
                    pikaEnd.setDate(end);
                } else {
                    $scope.endValue = 'now';
                    pikaEnd.setDate(end, true);
                    pikaStart.setMinDate();
                    pikaStart.setMaxDate(new Date());
                    pikaStart.hide();
                    pikaStart.show();
                }
            };

            function setDateRange (start, end) {
                $scope.guStartDate = start !== undefined
                    ? moment(start).toISOString()
                    : undefined;

                $scope.guEndDate = end !== undefined
                    ? moment(end).toISOString()
                    : undefined;

                setDisplayValue(start, end);
            };

            function closeModal () {
                $scope.showModal = false;
            };

            function reset() {
                setDateRange($scope.guStartDate, $scope.guEndDate);
            };

            function cancel () {
                reset();
                closeModal();
            };

            function save () {
                var start = pikaStart.getDate();
                start = start ? moment(start).startOf('day').toDate() : undefined;

                var end = pikaEnd.getDate();
                end = end ? moment(end).endOf('day').toDate() : undefined;

                setDateRange(start, end);
                closeModal();
            };

            function setPresetDate (preset) {
                setDateRange(preset, undefined);
                closeModal();
            };

            function clearStart () {
                pikaStart.setDate();
                pikaEnd.setMinDate();
                pikaEnd.setMaxDate(new Date());
                pikaEnd.hide();
                pikaEnd.show();
                pikaStart.gotoToday();
            };

            function clearEnd () {
                pikaEnd.setDate();
                pikaStart.setMinDate();
                pikaStart.setMaxDate(new Date());
                pikaStart.hide();
                pikaStart.show();
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
