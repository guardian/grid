import * as angular from 'angular';
import { getFeatureSwitchActive } from "../components/gr-feature-switch-panel/gr-feature-switch-panel";

export const tenancy = angular.module('util.tenancy', []);

tenancy.factory('tenancy', ['$window', function tenancy($window: angular.IWindowService) {
  function get() {
    if (getFeatureSwitchActive('multitenancy')) {
      return $window.localStorage.getItem('tenant');
    } else {
      return null;
    }
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
