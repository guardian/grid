import angular from 'angular';

export var codes = angular.module('kahuna.errors.codes', []);

codes.constant('errorCodes', {
    unauthorised: 401,
    authExpired: 419
});
