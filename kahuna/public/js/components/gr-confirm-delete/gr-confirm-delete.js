import angular from 'angular';

export const confirmDelete = angular.module('gr.confirmDelete', []);

confirmDelete.directive('grConfirmDelete', ['$timeout', function($timeout) {

    return {
        restrict: 'E',
        template: `
            <button class="button-ico" type="button" ng:click="showConfirm = true"
                title="remove usage rights overrides">
                <span class="confirm" ng:if="showConfirm">Sure?</span>
                <gr-icon>delete</gr-icon>
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
    }

}]);
