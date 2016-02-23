import angular from 'angular';

import template from './gr-filter-chooser-chip.html!text';

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
                $grChipsCtrl.replaceChip(chip, [{
                    type: 'filter',
                    filterType: chip.filterType,
                    key: value,
                    value: ''
                }]);
            } else {
                // Not a key, turn it into an 'any' filter and move focus next text
                const anyFilterChip = {
                    type: 'filter',
                    filterType: chip.filterType,
                    key: 'any',
                    value: value
                };
                const nextText = {
                    type: 'text',
                    value: ''
                };
                $grChipsCtrl.replaceChip(chip, [anyFilterChip, nextText]);
                $grChipsCtrl.setFocusedChip(nextText);
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
