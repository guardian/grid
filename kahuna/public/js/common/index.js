import angular from 'angular';

import './user-actions';
import './track-image-loadtime';

export var common = angular.module('kahuna.common', [
    'kahuna.common.userActions',
    'kahuna.common.trackImageLoadtime'
]);
