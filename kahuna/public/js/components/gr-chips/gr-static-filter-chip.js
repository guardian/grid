import angular from 'angular';

import template from './gr-static-filter-chip.html';

import {grChip} from './gr-chip';
import {grChipInput} from './gr-chip-input';


export const grStaticFilterChip = angular.module('gr.staticFilterChip', [
    grChip.name,
    grChipInput.name
]);

grStaticFilterChip.controller('grStaticFilterChipCtrl', function() {
    const $grStaticFilterChipCtrl = this;

    let $grChipsCtrl;
    let $grChipCtrl;

    $grStaticFilterChipCtrl.init = function($grChipsCtrl_, $grChipCtrl_) {
        $grChipsCtrl = $grChipsCtrl_;
        $grChipCtrl = $grChipCtrl_;
    };

    $grStaticFilterChipCtrl.toggleFilterType = function() {
        const chip = $grChipCtrl.chip;
        chip.filterType = chip.filterType === 'exclusion' ? 'inclusion' : 'exclusion';
        $grChipsCtrl.onChange();
    };
});

grStaticFilterChip.directive('grStaticFilterChip', [function() {
    return {
        restrict: 'E',
        require: ['grChip', 'grStaticFilterChip', '^grChips'],
        template: template,
        controller: 'grStaticFilterChipCtrl',
        controllerAs: '$grStaticFilterChipCtrl',
        link: function(scope, element, attrs,
                       [$grChipCtrl, $grStaticFilterChipCtrl, $grChipsCtrl]) {
            $grStaticFilterChipCtrl.init($grChipsCtrl, $grChipCtrl);
        }
    };
}]);
