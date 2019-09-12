import angular from 'angular';
import 'angular-xeditable';

import buttonTemplate from './gr-xeditable-buttons.html';

export var grXeditable = angular.module('grXeditable', [
    'xeditable'
]);

grXeditable.run(['editableOptions', 'editableThemes', function (editableOptions, editableThemes) {
    /*
     This is how xeditable is themed. BLEUGH!

     http://vitalets.github.io/angular-xeditable/#default
     */
    editableOptions.theme = 'default';

    // override the default template for submit and cancel buttons because we re-order the buttons
    // https://github.com/vitalets/angular-xeditable/blob/master/src/js/themes.js
    editableThemes['default'].submitTpl = null;
    editableThemes['default'].cancelTpl = null;

    editableThemes['default'].buttonsTpl = buttonTemplate;

    editableOptions.blurElem = 'ignore';
}]);
