import angular from 'angular';

import template from './gr-text-chip.html!text';

import {grChip} from './gr-chip';
import {grChipInput} from './gr-chip-input';

import {autoWidth} from '../../directives/gr-auto-width';


export const grTextChip = angular.module('gr.textChip', [
    grChip.name,
    grChipInput.name,
    autoWidth.name
]);

grTextChip.controller('grTextChipCtrl', function() {
    const $grTextChipCtrl = this;

    let $grChipsCtrl;
    let $grChipCtrl;

    $grTextChipCtrl.init = function($grChipsCtrl_, $grChipCtrl_) {
        $grChipsCtrl = $grChipsCtrl_;
        $grChipCtrl = $grChipCtrl_;
    };

    $grTextChipCtrl.removePrevious = function() {
        $grChipsCtrl.removeLastChip();
    };

    $grTextChipCtrl.removeNext = function() {
        $grChipsCtrl.removeChipAfter($grChipCtrl.chip);
    };

    $grTextChipCtrl.handleKey = function(event) {
        const {which, target} = event;
        const char = String.fromCharCode(which);
        const caretStart = target.selectionStart;
        const input = target.value;
        const noCharBefore = caretStart === 0 || input[caretStart - 1] === ' ';

        // if not within a word
        if (noCharBefore) {
            switch (char) {
            case '+':
                insertAndFocusFilterChooser('inclusion', caretStart, caretStart);
                event.preventDefault();
                break;
            case '-':
                insertAndFocusFilterChooser('exclusion', caretStart, caretStart);
                event.preventDefault();
                break;
            case '#':
                insertAndFocusFilter('inclusion', 'label', caretStart, caretStart);
                event.preventDefault();
                break;
            }
        }

        if (char === ':') {
            const [, sign, prevWord] = input.slice(0, caretStart).match(/\s*(-?)([a-zA-Z]+)$/);

            // Check previous word is a valid filter key
            if (prevWord && $grChipsCtrl.isValidKey(prevWord)) {
                const filterType = sign === '-' ? 'exclusion' : 'inclusion';
                const splitStart = caretStart - prevWord.length - sign.length;
                const splitEnd = caretStart;
                insertAndFocusFilter(filterType, prevWord, splitStart, splitEnd);
                event.preventDefault();
            }
        }
    };

    function insertAndFocus(newChip, splitStart, splitEnd) {
        const chip = $grChipCtrl.chip;
        const textUntil = chip.value.slice(0, splitStart).trimRight();
        const textAfter = chip.value.slice(splitEnd).trimLeft();

        const remainderChip = textAfter && {
            type: 'text',
            value: textAfter
        };
        const newChips = remainderChip ? [newChip, remainderChip] : [newChip];

        chip.value = textUntil;

        $grChipsCtrl.insertChips(chip, newChips);
        $grChipsCtrl.focusEndOfLastChip(chip); //newly created chip will be last
    }

    function insertAndFocusFilterChooser(filterType, splitStart) {
        insertAndFocus({
            type: 'filter-chooser',
            filterType: filterType,
            value: ''
        }, splitStart, splitStart);
    }

    function insertAndFocusFilter(filterType, key, splitStart, splitEnd) {
        insertAndFocus({
            type: 'filter',
            filterType: filterType,
            key: key,
            value: ''
        }, splitStart, splitEnd);
    }
});

grTextChip.directive('grTextChip', [function() {
    return {
        restrict: 'E',
        require: ['grChip', 'grTextChip', '^grChips'],
        template: template,
        controller: 'grTextChipCtrl',
        controllerAs: '$grTextChipCtrl',
        link: function(scope, element, attrs,
                       [$grChipCtrl, $grTextChipCtrl, $grChipsCtrl]) {
            $grTextChipCtrl.init($grChipsCtrl, $grChipCtrl);
        }
    };
}]);
