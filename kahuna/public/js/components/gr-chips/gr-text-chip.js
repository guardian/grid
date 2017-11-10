import angular from 'angular';

import template from './gr-text-chip.html';

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
        const noCharAfter = (input[caretStart] === ' ') || (input[caretStart] === undefined);

        // if not within a word, just before or just after
        if (noCharBefore && noCharAfter) {
            switch (char) {
            case '+':
                insertAndFocusFilterChooser('inclusion');
                event.preventDefault();
                break;
            case '-':
                insertAndFocusFilterChooser('exclusion');
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

    function insertAndFocus(newChip) {
        const newChips = [newChip];

        $grChipsCtrl.insertChips(newChips);
        $grChipsCtrl.focusEndOfLastChip(); //newly created chip will be last
    }

    function insertAndFocusFilterChooser(filterType) {
        insertAndFocus({
            type: 'filter-chooser',
            filterType: filterType,
            value: ''
        });
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
