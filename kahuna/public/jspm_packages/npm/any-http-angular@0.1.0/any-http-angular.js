/* */ 
import angular from 'angular';

// Utility aliases
var {extend} = angular;

export var mod = angular.module('anyHttp', []);


function mapResponseFor(uri) {
  return function({data, status, headers: getHeader}) {
    var headers = {
      'Location':     getHeader('Location'),
      'Content-Type': getHeader('Content-Type')
    };

    return {uri: uri, body: data, status: status, headers: headers};
  };
}

mod.factory('anyHttp.dispatch', ['$http', '$q', function($http, $q) {
  return function(method, uri, extraParams = {}) {
    var mapResponse = mapResponseFor(uri);

    // TODO: return a Promise from the promise adapter
    var defer = $q.defer();

    var req = $http(extend({
      url:     uri,
      method:  method,
      headers: {
        // FIXME: should be passed in as argument to make adapter more generic
        'Accept':       'application/vnd.argo+json',
        // FIXME: not for GET though? iff data?
        // FIXME: or argo?
        'Content-Type': 'application/json'
      },
      // TODO: optional:
      withCredentials: true
    }, extraParams)).then(
      r => defer.resolve(mapResponse(r)),
      r => defer.reject(mapResponse(r))
    );

    return defer.promise;
  };
}]);


mod.factory('anyHttp', ['anyHttp.dispatch', function(dispatch) {
  return {
    get(uri, params, implemOptions) {
      return dispatch('get', uri, extend({}, implemOptions, {params: params}));
    },

    post(uri, data, implemOptions) {
      return dispatch('post', uri, extend({}, implemOptions, {data: data}));
    },

    put(uri, data, implemOptions) {
      return dispatch('put', uri, extend({}, implemOptions, {data: data}));
    },

    patch(uri, data, implemOptions) {
      return dispatch('patch', uri, extend({}, implemOptions, {data: data}));
    },

    delete(uri, implemOptions) {
      return dispatch('delete', uri, implemOptions);
    }
  };
}]);

