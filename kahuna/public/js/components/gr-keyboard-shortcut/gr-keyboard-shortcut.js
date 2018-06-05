import angular from 'angular';
import 'angular-hotkeys';
import 'angular-hotkeys/build/hotkeys.min.css';


const module = angular.module('gr.keyboardShortcut', [
    'cfp.hotkeys',
]);

module.factory('keyboardShortcut', ['hotkeys', function (hotkeys) {
    return {
        // drop-in replacement for `hotkeys.bindTo` to add tracking
        bindTo: function (scope) {
            return {
                add: function (args) {
                    const hotKeyDefinition = angular.extend({}, args, {
                        callback: function (...params) {
                            $rootScope.$emit('track:event', 'Keyboard', 'Shortcut', 'Success', null, { shortcut: args.description });
                            args.callback(...params);
                        }
                    });

                    hotkeys.bindTo(scope).add(hotKeyDefinition);

                    return this;
                }
            };
        }
    };
}]);
