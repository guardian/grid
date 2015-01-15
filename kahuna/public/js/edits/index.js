import angular from 'angular';

import './archiver';
import './labeller';
import './edit-applicator';
import './applicator';

export var edits = angular.module('kahuna.edits', [
    'kahuna.edits.archiver',
    'kahuna.edits.labeller',
    'kahuna.edits.editApplicator',
    'kahuna.edits.applicator'
]);
