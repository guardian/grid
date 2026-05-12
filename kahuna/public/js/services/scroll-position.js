import angular from 'angular';

var scrollPosService = angular.module('kahuna.services.scroll-position', []);

scrollPosService.factory('scrollPosition',
                         ['$window',
                          function ($window) {

    // The saved scroll top position
    let positionTop;

    // The original URL where the position was saved
    let originalUrl;

    // Enable reset to top on next save
    let forceReset = false;

    function save(currentUrl) {
        originalUrl = currentUrl;
        // Accommodate Chrome & Firefox
        positionTop = document.body.scrollTop || document.documentElement.scrollTop;
    }

    function resume(currentUrl) {
        if (forceReset) {
          forceReset = false;
          positionTop = 0;
        }
        if (currentUrl === originalUrl) {
            $window.scrollTo(0, positionTop);
        }
    }

    function getSaved() {
        return positionTop;
    }

    function clear() {
        positionTop = undefined;
        originalUrl = undefined;
    }

    function resetToTop() {
      forceReset = true;
    }

    return {
        save,
        resume,
        getSaved,
        clear,
        resetToTop
    };
}]);


export default scrollPosService;
