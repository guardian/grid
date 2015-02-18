import angular from 'angular';

import './user-actions';
import './track-image-loadtime';
import './top-bar';

export var common = angular.module('kahuna.common', [
    'kahuna.common.userActions',
    'kahuna.common.trackImageLoadtime',
    'kahuna.common.topBar'
]);
