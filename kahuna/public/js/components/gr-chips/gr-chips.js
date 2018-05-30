import angular from 'angular';

import './gr-chips.css';
import template from './gr-chips.html';

import {grTextChip}          from './gr-text-chip';
import {grFilterChip}        from './gr-filter-chip';
import {grStaticFilterChip}  from './gr-static-filter-chip';
import {grFilterChooserChip} from './gr-filter-chooser-chip';


export const grChips = angular.module('gr.chips', [
    grTextChip.name,
    grFilterChip.name,
    grStaticFilterChip.name,
    grFilterChooserChip.name
]);

grChips.controller('grChipsCtrl', ['$scope', function($scope) {
    const $grChipsCtrl = this;

    $grChipsCtrl.items = [];
    $grChipsCtrl.focusedItem = null;
    $grChipsCtrl.caretStartOffset = null;
    $grChipsCtrl.caretEndOffset = null;

    $grChipsCtrl.configureNgModel = function(ngModelCtrl, onChangeExpr, autoCompleteExpr,
                                             validKeysExpr, autofocus, placeholder) {
        $grChipsCtrl.placeholder = placeholder;
        $grChipsCtrl.onChange = () => onChangeExpr($scope, {$chips: $grChipsCtrl.items});
        $grChipsCtrl.getSuggestions = ($chip) => autoCompleteExpr($scope, {$chip});

        const validKeys = validKeysExpr($scope);
        $grChipsCtrl.isValidKey = (key) => {
            if (Array.isArray(validKeys)) {
                return validKeys.indexOf(key) !== -1;
            } else {
                // No restriction on keys, all valid
                return true;
            }
        };

        ngModelCtrl.$render = function() {
            $grChipsCtrl.items = ngModelCtrl.$viewValue;

            if (autofocus) {
                $grChipsCtrl.focusEndOfFirstChip();
            }
        };
    };

    // Broadcast changes to the items list.
    // Note that individual chip directives also need to
    // broadcast updates to chip fields themselves.
    $scope.$watchCollection(() => $grChipsCtrl.items, (items, previousItems) => {
        // Ignore initialisation call
        if (items !== previousItems) {
            $grChipsCtrl.onChange();
        }
    });

    $grChipsCtrl.isEmpty = function() {
        return $grChipsCtrl.items.length === 1 &&
            $grChipsCtrl.items[0].value === '';
    };

    $grChipsCtrl.removeChip = function(item) {
        const index = $grChipsCtrl.items.indexOf(item);
        if (index !== -1) {
            removeChipAt(index);
        }
    };

    $grChipsCtrl.removeLastChip = function() {
        //do not remove text chip
        if ($grChipsCtrl.items.length > 1) {
            removeChipAt($grChipsCtrl.items.length - 1);
        }
    };

    $grChipsCtrl.setFocusedChip = function(item, caretStart = 0, caretEnd = 0) {
        const index = $grChipsCtrl.items.indexOf(item);
        if (index !== -1) {
            $grChipsCtrl.focusedItem = item;
            $grChipsCtrl.caretStartOffset = caretStart;
            $grChipsCtrl.caretEndOffset = caretEnd;
            return true;
        }
    };

    $grChipsCtrl.unsetFocusedChip = function(item) {
        if ($grChipsCtrl.focusedItem === item) {
            $grChipsCtrl.focusedItem = null;
            $grChipsCtrl.caretStartOffset = null;
            $grChipsCtrl.caretEndOffset = null;
            return true;
        }
    };

    $grChipsCtrl.focusEndOfChipBefore = function(item) {
        const index = $grChipsCtrl.items.indexOf(item) - 1;
        if (index >= 0) {
            const previousItem = $grChipsCtrl.items[index];
            const itemLength = previousItem.value.length;
            return $grChipsCtrl.setFocusedChip(previousItem, itemLength, itemLength);
        }
    };

    $grChipsCtrl.focusStartOfChipAfter = function(item) {
        const index = $grChipsCtrl.items.indexOf(item) + 1;
        if (index <= $grChipsCtrl.items.length) {
            return $grChipsCtrl.setFocusedChip($grChipsCtrl.items[index], 0, 0);
        }
    };

    $grChipsCtrl.focusStartOfFirstChip = function() {
        const firstItem = $grChipsCtrl.items[0];
        if (firstItem) {
            return $grChipsCtrl.setFocusedChip(firstItem, 0, 0);
        }
    };

    $grChipsCtrl.focusEndOfFirstChip = function() {
        const firstItem = $grChipsCtrl.items[0];
        if (firstItem) {
            const itemLength = firstItem.value.length;
            return $grChipsCtrl.setFocusedChip(firstItem, itemLength, itemLength);
        }
    };

    $grChipsCtrl.focusEndOfLastChip = function() {
        const lastItem = $grChipsCtrl.items.slice(-1)[0];
        if (lastItem) {
            const itemLength = lastItem.value.length;
            return $grChipsCtrl.setFocusedChip(lastItem, itemLength, itemLength);
        }
    };

    $grChipsCtrl.insertChips = function(newItems) {
        //always insert chips to the end of items list
        //NB text chip is styled to appear last but is first in the items list
        const end = $grChipsCtrl.items.length;
        $grChipsCtrl.items.splice(end, 0, ...newItems);
    };

    $grChipsCtrl.replaceChip = function(existingItem, newItems) {
        const index = $grChipsCtrl.items.indexOf(existingItem);
        $grChipsCtrl.items.splice(index, 1, ...newItems);
        if ($grChipsCtrl.focusedItem === existingItem) {
            $grChipsCtrl.setFocusedChip(newItems[0]);
        }
    };

    function removeChipAt(index) {
        // If chip to remove is focused, move focus right before or after
        const removedItem = $grChipsCtrl.items[index];
        if (removedItem === $grChipsCtrl.focusedItem) {
            $grChipsCtrl.focusEndOfChipBefore(removedItem) ||
                $grChipsCtrl.focusStartOfChipAfter(removedItem);
        }
        $grChipsCtrl.items.splice(index, 1);
    }

}]);

grChips.directive('grChips', ['$parse', function($parse) {
    return {
        restrict: 'E',
        require: 'grChips',
        template: template,
        controller: 'grChipsCtrl',
        controllerAs: '$grChipsCtrl',
        compile: function compile(element, attrs) {
            const autoCompleteExpr = $parse(attrs.grAutocomplete);
            const onChangeExpr = $parse(attrs.grOnChange);
            const validKeysExpr = $parse(attrs.grValidKeys);
            return function link(scope, element, attrs, $grChipsCtrl) {
                const ngModelCtrl = element.controller('ngModel');
                const autofocus = 'autofocus' in attrs;
                const placeholder = attrs.placeholder;
                $grChipsCtrl.configureNgModel(
                    ngModelCtrl,
                    onChangeExpr,
                    autoCompleteExpr,
                    validKeysExpr,
                    autofocus,
                    placeholder
                );
            };
        }
    };
}]);



/* TODO
  * cannot focus static filter, breaks navigation
  - auto-completion: key descriptions
 */
