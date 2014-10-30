// import theseus from 'theseus';
// ^ Not working, see https://github.com/jspm/project/issues/15
import {Client} from 'theseus/src/theseus';

import 'theseus/src/http/angular';
import 'theseus/src/promise/angular';

import angular from 'angular';

var apiServices = angular.module('theseus', ['anyHttp', 'anyPromise']);

apiServices.factory('theseus.Client', ['http', 'promise', function(http, promise) {
    return new Client({http: http, promise: promise});
}]);
