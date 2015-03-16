import angular from 'angular';

export var resize = angular.module('imgopts.resize', []);

resize.directive('imgResize', ['imgOpts', imgOpts => {
    return {
        restrict: 'A',
        scope: {
            src: '@imgSrc',
            dimensions: '=imgDimensions'
        },
        link: (scope, element) => {
            element.attr('src', imgOpts.getSrc(scope.src));
        }
    };
}]);


resize.factory('imgOpts', ['imgoptsUri', imgoptsUri => {
    var getResizeValues = () => {
        return {
            w: 500,
            h: 500,
            q: 500
        }
    };

    var getSrc = uri => {
        var u = new URL(uri);
        var resizeValues = getResizeValues();
        var resizeParams = Object.keys(resizeValues).map(key => [key, resizeValues[key]].join('='));

        var qs = u.search.split('&').concat(resizeParams).join('&');

        return imgoptsUri + u.pathname + qs;
    };


    return {
        getSrc,
        getResizeValues
    }
}]);
