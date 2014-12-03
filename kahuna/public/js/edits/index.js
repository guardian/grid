import angular from 'angular';

import 'edits/archiver';
import 'edits/labeller';

export var upload = angular.module('kahuna.edits', [
    'kahuna.edits.archiver',
    'kahuna.edits.labeller'
]);
