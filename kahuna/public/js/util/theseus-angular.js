import {Client} from 'theseus';

import 'any-http-angular';
import 'any-promise-angular';

import angular from 'angular';

var theseusModule = angular.module('theseus', ['anyHttp', 'anyPromise']);

theseusModule.factory('theseus.client', ['anyHttp', 'anyPromise', function(http, promise) {
    return new Client({http: http, promise: promise});
}]);
