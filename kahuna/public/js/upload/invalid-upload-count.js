import angular from 'angular';
import template from './invalid-upload-count.html!text';

export var count = angular.module('kahuna.upload.invalidUploadCount', []);

count.controller('InvalidUploadCountCtrl', ['mediaApi', function(mediaApi) {
    mediaApi.getSession().then(session => {
        mediaApi.search('', { uploadedBy: session.user.email, valid: false }).then(images => {
            this.total = images.total;
        });
    });
}]);


count.directive('uiInvalidUploadCount', [function() {
    return {
        restrict: 'E',
        controller: 'InvalidUploadCountCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
