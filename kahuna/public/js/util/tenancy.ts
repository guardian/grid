import * as angular from 'angular';

export const tenancy = angular.module('util.tenancy', []);

tenancy.factory('tenancy', ['$window', function tenancy($window: angular.IWindowService) {
  function get() {
    return $window.localStorage.getItem('tenant');
  }
  function set(tenantId: string) {
    return $window.localStorage.setItem('tenant', tenantId);
  }
  function clear() {
    return $window.localStorage.removeItem('tenant');
  }

  return {
    get,
    set,
    clear
  };
}]);
