import angular from 'angular';
import 'angular-hotkeys';

import '../../analytics/track';

const module = angular.module('gr.keyboardShortcut', [
    'cfp.hotkeys',
    'analytics.track'
]);

module.factory('keyboardShortcut', ['hotkeys', 'track', function (hotkeys, track) {
    return {
        // drop-in replacement for `hotkeys.bindTo` to add tracking
        bindTo: function (scope) {
            return {
                add: function (args) {
                    const hotKeyDefinition = angular.extend({}, args, {
                        callback: function (...params) {
                            track.success('Keyboard shortcut', { shortcut: args.description });
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
