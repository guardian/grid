import angular from 'angular';

import 'edits/archiver';
import 'edits/labeler';

export var upload = angular.module('kahuna.edits', [
    'kahuna.edits.archiver',
    'kahuna.edits.labeler'
]);
