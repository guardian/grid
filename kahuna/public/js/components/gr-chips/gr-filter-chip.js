import angular from 'angular';

import template from './gr-filter-chip.html';

import {grChip} from './gr-chip';
import {grChipInput} from './gr-chip-input';

import {datalist} from '../../forms/datalist';
import {autoWidth} from '../../directives/gr-auto-width';


export const grFilterChip = angular.module('gr.filterChip', [
    grChip.name,
    grChipInput.name,
    datalist.name,
    autoWidth.name
]);

grFilterChip.controller('grFilterChipCtrl', function() {
    const $grFilterChipCtrl = this;

    let $grChipsCtrl;
    let $grChipCtrl;

    $grFilterChipCtrl.init = function($grChipsCtrl_, $grChipCtrl_) {
        $grChipsCtrl = $grChipsCtrl_;
        $grChipCtrl = $grChipCtrl_;
    };

    $grFilterChipCtrl.apply = function(value) {
        // Only transform if /something/ is submitted
        if (value) {
            const chip = $grChipCtrl.chip;

            // Hack: this shouldn't be necessary as the value is
            // data-bound to be the same, but there's a sequencing
            // issue with datalist causing the update to come *after*
            // this fires, without the value in case of mouse clicks
            chip.value = value;

            $grChipsCtrl.focusEndOfFirstChip();  //return focus to the text chip
            $grChipsCtrl.onChange();
        }
    };

    $grFilterChipCtrl.toggleFilterType = function() {
        const chip = $grChipCtrl.chip;
        chip.filterType = chip.filterType === 'exclusion' ? 'inclusion' : 'exclusion';
        $grChipsCtrl.onChange();
    };

    $grFilterChipCtrl.removeSelf = function() {
        $grChipsCtrl.removeChip($grChipCtrl.chip);
    };
});

grFilterChip.directive('grFilterChip', [function() {
    return {
        restrict: 'E',
        require: ['grChip', 'grFilterChip', '^grChips'],
        template: template,
        controller: 'grFilterChipCtrl',
        controllerAs: '$grFilterChipCtrl',
        link: function(scope, element, attrs,
                       [$grChipCtrl, $grFilterChipCtrl, $grChipsCtrl]) {
            $grFilterChipCtrl.init($grChipsCtrl, $grChipCtrl);
        }
    };
}]);
