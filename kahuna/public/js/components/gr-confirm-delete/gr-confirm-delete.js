import angular from 'angular';
import './gr-confirm-delete.css!';

export const confirmDelete = angular.module('gr.confirmDelete', []);

confirmDelete.directive('grConfirmDelete', ['$timeout', function($timeout) {

    return {
        restrict: 'E',
        transclude: true,
        template: `
            <button class="gr-confirm-delete" type="button"
                ng:click="showConfirm = true"
                ng:class="{'gr-confirm-delete--confirm': showConfirm}">
                <gr-icon>delete</gr-icon>
                <ng-transclude ng:if="!showConfirm"></ng-transclude>
                <span class="gr-confirm-delete__label" ng:if="showConfirm">Confirm delete</span>
            </button>`,

        link: function(scope, element, attrs) {
            const onChange = () => scope.$eval(attrs.grOnConfirm);

            element.on('click', function() {
                element.on('click', onChange);
                $timeout(() => {
                    element.off('click', onChange);
                    scope.showConfirm = false;
                }, 5000);
            });
        }
    };

}]);
