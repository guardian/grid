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
            guEndDate: '=guEndDate'
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

            function init () {
                if ($scope.guStartDate !== undefined && $scope.guEndDate !== undefined) {
                    var startDate = moment($scope.guStartDate).toDate();
                    pikaStart.setDate(startDate);

                    var endDate = moment($scope.guEndDate).toDate();
                    pikaEnd.setDate(endDate);

                    setDisplayValue();
                }
            };

            init();

            function getStartDate () {
                return moment(pikaStart.getDate()).startOf('day');
            }

            function getEndDate () {
                return moment(pikaEnd.getDate()).endOf('day');
            }

            function setDisplayValue () {
                var startDate = getStartDate().format('DD-MMM-YYYY');
                var endDate = getEndDate().format('DD-MMM-YYYY');

                $scope.displayValue = [startDate, endDate].join(' to ');
            };

            $scope.cancel = function () {
                init();
                $scope.showModal = false;
            };

            $scope.save = function () {
                $scope.guStartDate = getStartDate().toISOString();
                $scope.guEndDate = getEndDate().toISOString();
                setDisplayValue();
                $scope.showModal = false;
            };
        }
    };
}]);
