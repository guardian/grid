import angular from 'angular';

export const grChip = angular.module('gr.chip', []);

grChip.directive('grChip', ['$parse', function($parse) {
    return {
        restrict: 'A',
        require: ['grChip', '^grChips'],
        controller: function() {
            const $grChipCtrl = this;

            $grChipCtrl.chip = null;

            $grChipCtrl.init = function(chip) {
                $grChipCtrl.chip = chip;
            };
        },
        controllerAs: '$grChipCtrl',
        compile: function(element, attrs) {
            const termExpr = $parse(attrs.grChip);

            return function(scope, element, attrs, [$grChipCtrl]) {
                $grChipCtrl.init(termExpr(scope));
            };
        }
    };
}]);
