import angular from 'angular';

import 'edits/archiver';
import 'edits/labeller';
import 'edits/edit-applicator';

export var upload = angular.module('kahuna.edits', [
    'kahuna.edits.archiver',
    'kahuna.edits.labeller',
    'kahuna.edits.editApplicator'
]);
