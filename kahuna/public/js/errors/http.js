import angular from 'angular';

export var errors = angular.module('kahuna.errors.http', []);

errors.constant('httpErrors', {
    unknown: {
        errorCode: 'unknown',
        errorMessage: 'Unknown error'
    },
    unauthorised: {
        errorCode: 401,
        errorMessage: 'Unauthorised request'
    },
    authFailed: {
        errorCode: 419,
        errorMessage: 'Authentication re-establishment failed'
    }
});
