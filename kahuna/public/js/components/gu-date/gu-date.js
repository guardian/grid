import angular from 'angular';
import moment from 'moment';
import Pikaday from 'pikaday';
import 'pikaday/css/pikaday.css';

import template from './gu-date.html';
import rangeTemplate from './gu-date-range-x.html';
import './gu-date.css';

const DISPLAY_FORMAT = 'DD MMM YYYY';
const TEN_YEARS_MILLIS = (10 * 365 * 24 * 60 * 60 * 1000);
const START_OF_WEEK = 1; // Monday

export const guDate = angular.module('gu.date', []);

guDate.directive('guDate', [function () {
    return {
        template: template,
        scope: {
            label: '@',
            date: '=',
            minDate: '=?',
            maxDate: '=?'
        },
        link: function($scope, el) {
            if (angular.isDefined($scope.minDate) && angular.isDefined($scope.maxDate)) {
                throw 'gu-date can have either a minDate or a maxDate. Not both.';
            }

            function getDateISOString (value) {
                return angular.isDefined(value)
                    ? moment(value).toISOString()
                    : undefined;
            }

            function getDisplayValue(value) {
                return angular.isDefined(value)
                    ? moment(value).format(DISPLAY_FORMAT)
                    : 'anytime';
            }

            const tenYearsFromNow = new Date(Date.now() + TEN_YEARS_MILLIS);

            const root = el[0];
            const input = root.querySelector('input.gu-date__value--hidden');
            const container = root.querySelector('.gu-date__container');

            const pika = new Pikaday({
                field: input,
                container: container,
                bound: false,
                minDate: $scope.minDate && new Date($scope.minDate),
                maxDate: tenYearsFromNow,
                yearRange: 100,
                firstDay: START_OF_WEEK,
                format: DISPLAY_FORMAT,
                keyboardInput: false
            });

            $scope.clear = () => {
                pika.setDate();
                pika.gotoToday();
            };

            $scope.closeOverlay = () => $scope.showingOverlay = false;

            if (angular.isDefined($scope.minDate)) {
                $scope.dateRounder = (date) => moment(date).endOf('day').toDate();

                $scope.$watch('minDate', value => {
                    const dateValue = value ? new Date(value) : new Date();
                    pika.setMinDate(dateValue);
                });
            }

            if (angular.isDefined($scope.maxDate)) {
                $scope.dateRounder = (date) => moment(date).startOf('day').toDate();

                $scope.$watch('maxDate', value => {
                    const dateValue = value ? new Date(value) : new Date();
                    pika.setMaxDate(dateValue);
                });
            }

            $scope.$watch('pikaValue', value => {
                const date = value === ""
                    ? undefined
                    : angular.isDefined($scope.dateRounder)
                        ? $scope.dateRounder(value)
                        : value;

                $scope.date = getDateISOString(date);
                $scope.displayValue = getDisplayValue(date);
                $scope.closeOverlay();
            });

            $scope.$on('$destroy', () => pika.destroy);

            pika.setDate($scope.date);
        }
    };
}]);

guDate.directive('guDateRangeX', [function () {
    return {
        template: rangeTemplate,
        scope: {
            start: '=',
            end: '='
        }
    };
}]);
