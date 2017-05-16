import angular from 'angular';
import Rx from 'rx';

import '../../util/rx';

export var grCropsPanel = angular.module('grCropsPanel', [
    'kahuna.services.panel'
]);

grCropsPanel.controller('GrCropsPanelCtrl', [
    '$scope',
    'inject$',
    'selectedImagesList$',
    function (
        $scope,
        inject$,
        selectedImagesList$
    ) {

    //TODO: Use seperate CSS
    const ctrl = this;
    const exportsList$ = selectedImagesList$.map(images =>
        images
            .map(image => image.data.exports)
            .filter(exports => exports.length != 0)
    );

    //TODO: Remove log
    exportsList$.subscribe(exports => console.log(exports));

    inject$($scope, exportsList$, ctrl, 'exportsList');
}]);


