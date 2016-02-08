import angular from 'angular';

import '../gr-keyboard-shortcut/gr-keyboard-shortcut';

export var lazyTableShortcuts = angular.module('gu.lazyTableShortcuts', [
    'gr.keyboardShortcut'
]);

lazyTableShortcuts.directive('guLazyTableShortcuts',
                             ['keyboardShortcut',
                              function(keyboardShortcut) {
    return {
        restrict: 'EA',
        require: '^guLazyTable',
        link: function (scope, element, attrs, lazyTableCtrl) {
            function invoke(fnName) {
                return (event) => {
                    // Must cancel any scrolling caused by the key
                    event.preventDefault();

                    lazyTableCtrl[fnName]();
                };
            }

            keyboardShortcut.bindTo(scope)
                .add({
                    combo: 'up',
                    description: 'Scroll results up by one row',
                    allowIn: ['INPUT'],
                    callback: invoke('scrollPrevRow')
                })
                .add({
                    combo: 'down',
                    description: 'Scroll results down by one row',
                    allowIn: ['INPUT'],
                    callback: invoke('scrollNextRow')
                })
                .add({
                    combo: 'pageup',
                    description: 'Scroll results up by one page',
                    allowIn: ['INPUT'],
                    callback: invoke('scrollPrevPage')
                })
                .add({
                    combo: 'pagedown',
                    description: 'Scroll results down by one page',
                    allowIn: ['INPUT'],
                    callback: invoke('scrollNextPage')
                })
                // Home/End not allowed in text field as useful for input navigation
                .add({
                    combo: 'home',
                    description: 'Scroll results to the start',
                    callback: invoke('scrollStart')
                })
                .add({
                    combo: 'end',
                    description: 'Scroll results to the end',
                    callback: invoke('scrollEnd')
                });
        }
    };
}]);
