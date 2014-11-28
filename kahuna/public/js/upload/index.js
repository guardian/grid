import angular from 'angular';

import 'upload/controller';
import 'upload/file-uploader';
import 'upload/manager';
import 'upload/dnd-uploader';
import 'upload/jobs/upload-jobs';
import 'upload/jobs/required-metadata-editor';

export var upload = angular.module('kahuna.upload', [
    'kahuna.upload.controller',
    'kahuna.upload.fileUploader',
    'kahuna.upload.manager',
    'kahuna.upload.dndUploader',
    'kahuna.upload.jobs',
    'kahuna.upload.jobs.requiredMetadataEditor'
]);
