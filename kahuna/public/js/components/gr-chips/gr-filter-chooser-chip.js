import angular from 'angular';

import template from './gr-filter-chooser-chip.html';

import {grChip} from './gr-chip';
import {grChipInput} from './gr-chip-input';

import {datalist} from '../../forms/datalist';
import {autoWidth} from '../../directives/gr-auto-width';


export const grFilterChooserChip = angular.module('gr.filterChooserChip', [
    grChip.name,
    grChipInput.name,
    datalist.name,
    autoWidth.name
]);

grFilterChooserChip.controller('grFilterChooserChipCtrl', function() {
    const $grFilterChooserChipCtrl = this;

    let $grChipsCtrl;
    let $grChipCtrl;

    // Hack to prevents double-application of datalist/ENTER key
    let applied = false;

    $grFilterChooserChipCtrl.init = function($grChipsCtrl_, $grChipCtrl_) {
        $grChipsCtrl = $grChipsCtrl_;
        $grChipCtrl = $grChipCtrl_;
    };

    $grFilterChooserChipCtrl.apply = function(value) {
        // Only transform if /something/ is submitted
        if (value && ! applied) {
            // Prevent double-application of datalist/ENTER key, as
            // both events get fired even though the first one caused
            // this chip to be replaced
            applied = true;

            const chip = $grChipCtrl.chip;
            if ($grChipsCtrl.isValidKey(value)) {
                // Valid key, turn it into a filter
                const filterChip = {
                    type: 'filter',
                    filterType: chip.filterType,
                    key: value,
                    value: ''
                };
                $grChipsCtrl.replaceChip(chip, [filterChip]);
                // Force-set the focus in case the user clicked on the
                // dropdown which blurred the current chip
                $grChipsCtrl.setFocusedChip(filterChip);
            } else {
                // If text search included negation, replace it
                const prepend = (chip.filterType === 'exclusion' ? '-' : '');

                // Not a key, turn it back to text search
                $grFilterChooserChipCtrl.removeSelf();
                $grChipsCtrl.items[0].value += (' ' + prepend + value);
                $grChipsCtrl.focusEndOfFirstChip();
            }
        }
    };

    $grFilterChooserChipCtrl.removeSelf = function() {
        $grChipsCtrl.removeChip($grChipCtrl.chip);
    };
});

grFilterChooserChip.directive('grFilterChooserChip', [function() {
    return {
        restrict: 'E',
        require: ['grChip', 'grFilterChooserChip', '^grChips'],
        template: template,
        controller: 'grFilterChooserChipCtrl',
        controllerAs: '$grFilterChooserChipCtrl',
        link: function(scope, element, attrs,
                       [$grChipCtrl, $grFilterChooserChipCtrl, $grChipsCtrl]) {
            $grFilterChooserChipCtrl.init($grChipsCtrl, $grChipCtrl);
        }
    };
}]);
