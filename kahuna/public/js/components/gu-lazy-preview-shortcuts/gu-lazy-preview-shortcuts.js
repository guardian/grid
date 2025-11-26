import angular from 'angular';

import '../gr-keyboard-shortcut/gr-keyboard-shortcut';

export var lazyPreviewShortcuts = angular.module('gu.lazyPreviewShortcuts', [
    'gr.keyboardShortcut'
]);

lazyPreviewShortcuts.directive('guLazyPreviewShortcuts',
                             ['keyboardShortcut',
                              function(keyboardShortcut) {
    return {
        restrict: 'EA',
        require: '^guLazyPreview',
        link: function (scope, element, attrs, lazyGalleryCtrl) {
            function invoke(fnName) {
                return (event) => {
                    // Must cancel any scrolling caused by the key
                    event.preventDefault();
                    lazyGalleryCtrl[fnName]();
                };
            }

            keyboardShortcut.bindTo(scope)
                .add({
                    combo: 'left',
                    description: 'Go to the previous image',
                    allowIn: ['INPUT'],
                    callback: invoke('prevItem')
                })
                .add({
                    combo: 'right',
                    description: 'Go to the next image',
                    allowIn: ['INPUT'],
                    callback: invoke('nextItem')
                });
        }
    };
}]);
