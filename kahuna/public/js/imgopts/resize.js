import angular from 'angular';

export var resize = angular.module('imgopts.resize', []);

resize.directive('imgSrc', ['imgopts', imgopts => {
    return {
        restrict: 'A',
        link: (scope, element, attrs) => {
            // we're using the attrs here as if we use scope we land up into
            // trouble trying to acces the same scope values as other directives.
            // Damn lack of one way data binding:
            // https://docs.angularjs.org/error/$compile/multidir
            element.attr('src', imgopts.getSrc(attrs.imgSrc));
        }
    };
}]);


resize.factory('imgopts', ['$window', 'imgoptsUri', ($window, imgoptsUri) => {

    var getResizeValues = () => {
        var { width: w, height: h } = $window.screen;
        return { w, h, q: 95 };
    };

    var getSrc = uri => {
        var u = new URL(uri);
        var resizeValues = getResizeValues();
        var resizeParams = Object.keys(resizeValues).map(key => [key, resizeValues[key]].join('='));
        var qs = u.search.split('&').concat(resizeParams).join('&');

        return imgoptsUri + u.pathname + qs;
    };

    return { getSrc };
}]);
