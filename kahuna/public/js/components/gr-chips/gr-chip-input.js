import angular from 'angular';

export const grChipInput = angular.module('gr.chipInput', []);


const ENTER_KEY     = 13;
const BACKSPACE_KEY = 8;
const DELETE_KEY    = 46;
const LEFT_KEY      = 37;
const RIGHT_KEY     = 39;
const HOME_KEY      = 36;
const END_KEY       = 35;

function keyHandler(handler) {
    return function (event) {
        const {which, target} = event;
        const caretStart = target.selectionStart;
        const caretEnd   = target.selectionEnd;

        const input = target.value;
        const inputLen = input.length;
        const atInputStart = caretStart === 0 && caretEnd === 0;
        const atInputEnd = caretStart === inputLen && caretEnd === inputLen;
        const noCharBefore = caretStart === 0 || input[caretStart - 1] === ' ';

        const handled = handler({
            which,
            atInputStart,
            atInputEnd,
            noCharBefore,
            caretStart,
            caretEnd
        });
        if (handled) {
            event.preventDefault();
            event.stopPropagation();
        }
    };
}


grChipInput.directive('grChipInput', ['$parse', '$timeout', function($parse, $timeout) {
    return {
        restrict: 'A',
        require: ['^grChip', '^grChips'],
        link: function(scope, element, attrs, [$grChipCtrl, $grChipsCtrl]) {
            const [
                onEnterExpr,
                backspaceStartExpr,
                deleteEndExpr
            ] = [
                attrs.grChipInputOnEnter,
                attrs.grChipInputBackspaceAtStart,
                attrs.grChipInputDeleteAtEnd
            ].map(attr => attr && $parse(attr));

            scope.$watchCollection(() => ({focusedItem: $grChipsCtrl.focusedItem,
                                           caretStartOffset: $grChipsCtrl.caretStartOffset,
                                           caretEndOffset: $grChipsCtrl.caretEndOffset}),
                                   ({focusedItem, caretStartOffset, caretEndOffset}) => {
                // Focus self (unless already focused)
                if (focusedItem === $grChipCtrl.chip) {
                    const selStart = element[0].selectionStart;
                    const selEnd   = element[0].selectionEnd;
                    // Unless already focused at the same caret location
                    if (document.activeElement !== element[0] ||
                        selStart !== caretStartOffset ||
                        selEnd !== caretEndOffset) {
                        // Yield to avoid digest-within-digest of focus event
                        $timeout(() => {
                            element[0].focus();
                            element[0].setSelectionRange(caretStartOffset, caretEndOffset);
                        });
                    }
                }
            });

            element.on('focus', () => {
                // Caret position not set yet, yield to get it
                $timeout(() => {
                    const selStart = element[0].selectionStart;
                    const selEnd   = element[0].selectionEnd;
                    $grChipsCtrl.setFocusedChip($grChipCtrl.chip, selStart, selEnd);
                });
            });

            element.on('blur', () => {
                $grChipsCtrl.unsetFocusedChip($grChipCtrl.chip);
                scope.$digest();
            });

            element.on('input', () => {
                const selStart = element[0].selectionStart;
                const selEnd   = element[0].selectionEnd;

                $grChipsCtrl.onChange();
                $grChipsCtrl.setFocusedChip($grChipCtrl.chip, selStart, selEnd);
                scope.$apply();
            });

            element.on('keydown', keyHandler(function({which, atInputStart, atInputEnd}) {
                switch (which) {
                case ENTER_KEY:
                    if (onEnterExpr) {
                        onEnterExpr(scope);
                        scope.$apply();
                        return true;
                    }
                    break;
                case LEFT_KEY:
                    if (atInputStart) {
                        $grChipsCtrl.focusEndOfChipBefore($grChipCtrl.chip);
                        scope.$apply();
                        return true;
                    }
                    break;
                case RIGHT_KEY:
                    if (atInputEnd) {
                        $grChipsCtrl.focusStartOfChipAfter($grChipCtrl.chip);
                        scope.$apply();
                        return true;
                    }
                    break;
                case BACKSPACE_KEY:
                    if (atInputStart && backspaceStartExpr) {
                        backspaceStartExpr(scope);
                        scope.$apply();
                        return true;
                    }
                    break;
                case DELETE_KEY:
                    if (atInputEnd && deleteEndExpr) {
                        deleteEndExpr(scope);
                        scope.$apply();
                        return true;
                    }
                    break;

                // Emulate Home/End to go to start/end of input
                case HOME_KEY:
                    $grChipsCtrl.focusStartOfFirstChip();
                    scope.$apply();
                    return true;
                case END_KEY:
                    $grChipsCtrl.focusEndOfLastChip();
                    scope.$apply();
                    return true;
                }
            }));
        }
    };
}]);
