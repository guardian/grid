import angular from 'angular';

import './controller';
import './file-uploader';
import './manager';
import './dnd-uploader';
import './jobs/upload-jobs';
import './jobs/required-metadata-editor';
import '../components/gr-top-bar/gr-top-bar';

import uploadTemplate from './view.html';


export var upload = angular.module('kahuna.upload', [
    'kahuna.upload.controller',
    'kahuna.upload.fileUploader',
    'kahuna.upload.manager',
    'kahuna.upload.dndUploader',
    'kahuna.upload.jobs',
    'kahuna.upload.jobs.requiredMetadataEditor',
    'gr.topBar'
]);


upload.config(['$stateProvider',
               function($stateProvider) {

    $stateProvider.state('upload', {
        url: '/upload',
        template: uploadTemplate,
        controller: 'UploadCtrl',
        controllerAs: 'ctrl',
        bindToController: true
    });
}]);
