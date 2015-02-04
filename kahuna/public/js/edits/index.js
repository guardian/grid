import angular from 'angular';

import './archiver';
import './labeller';

export var edits = angular.module('kahuna.edits', [
    'kahuna.edits.archiver',
    'kahuna.edits.labeller'
]);
