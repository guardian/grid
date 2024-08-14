import angular from 'angular';

var scrollPosService = angular.module('kahuna.services.scroll-position', []);

scrollPosService.factory('scrollPosition',
                         ['$window',
                          function ($window) {

    // The saved scroll top position
    let positionTop;

    // The original context where the position was saved
    let originalContext;

    function save(currentContext) {
        // deal with url ambiguity over nonFree parameter
        if (!currentContext.nonFree) {
          currentContext.nonFree = "false";
        }
        originalContext = currentContext;
        // Accommodate Chrome & Firefox
        positionTop = document.body.scrollTop || document.documentElement.scrollTop;
    }

    function resume(currentContext) {
        // deal with url ambiguity over nonFree parameter
        if (!currentContext.nonFree) {
          currentContext.nonFree = "false";
        }
        if (angular.equals(currentContext, originalContext)) {
            $window.scrollTo(0, positionTop);
        }
    }

    function getSaved() {
        return positionTop;
    }

    function clear() {
        positionTop = undefined;
        originalContext = undefined;
    }

    return {
        save,
        resume,
        getSaved,
        clear
    };
}]);


export default scrollPosService;
