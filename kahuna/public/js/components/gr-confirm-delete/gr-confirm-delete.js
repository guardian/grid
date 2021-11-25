import angular from 'angular';
import './gr-confirm-delete.css';

export const confirmDelete = angular.module('gr.confirmDelete', []);

confirmDelete.directive('grConfirmDelete', ['$timeout', function($timeout) {

    return {
        restrict: 'E',
        transclude: true,
        template: `
            <button class="gr-confirm-delete inner-clickable side-padded" type="button"
                ng:click="showConfirm = true"
                ng:class="{'gr-confirm-delete--confirm': showConfirm}">
                <gr-icon-label ng:if="!showConfirm" gr-icon="delete">{{label}}</gr-icon-label>
                <gr-icon-label ng:if="showConfirm" gr-icon="delete">{{confirm}}</gr-icon-label>
            </button>`,

        link: function(scope, element, attrs) {
            const onChange = () => scope.$eval(attrs.grOnConfirm);

            scope.label = attrs.grLabel || 'Delete';
            scope.confirm = attrs.grConfirm || 'Confirm delete';

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
