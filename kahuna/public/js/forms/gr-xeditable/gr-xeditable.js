import angular from 'angular';
import 'angular-xeditable';

import submitButton from './submit.html!text';
import cancelButton from './cancel.html!text';

import './gr-xeditable.css!';

export var grXeditable = angular.module('grXeditable', [
    'xeditable'
]);

grXeditable.run(function (editableOptions, editableThemes) {
    /*
     This is how xeditable is themed. BLEUGH!

     http://vitalets.github.io/angular-xeditable/#default
     */
    editableOptions.theme = 'default';

    editableThemes['default'].submitTpl = submitButton;
    editableThemes['default'].cancelTpl = cancelButton;
});
