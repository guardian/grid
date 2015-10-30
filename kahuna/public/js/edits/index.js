import angular from 'angular';

import './ui-archiver/archiver';
import './labeller';

export var edits = angular.module('kahuna.edits', [
    'kahuna.edits.archiver',
    'kahuna.edits.labeller'
]);
