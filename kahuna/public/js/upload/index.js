import angular from 'angular';

import './controller';
import './file-uploader';
import './manager';
import './dnd-uploader';
import './jobs/upload-jobs';
import './jobs/required-metadata-editor';

export var upload = angular.module('kahuna.upload', [
    'kahuna.upload.controller',
    'kahuna.upload.fileUploader',
    'kahuna.upload.manager',
    'kahuna.upload.dndUploader',
    'kahuna.upload.jobs',
    'kahuna.upload.jobs.requiredMetadataEditor'
]);
