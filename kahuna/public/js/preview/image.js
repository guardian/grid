import angular from 'angular';
import Rx from 'rx';

import '../util/rx';

import template from './image.html';
import templateLarge from './image-large.html';

import '../image/service';
import '../imgops/service';
import '../services/image/usages';
import '../components/gr-add-label/gr-add-label';
import '../components/gr-archiver-status/gr-archiver-status';
import '../components/gr-syndication-icon/gr-syndication-icon';

export var image = angular.module('kahuna.preview.image', [
    'gr.image.service',
    'gr.image-usages.service',
    'gr.addLabel',
    'gr.archiverStatus',
    'gr.syndicationIcon',
    'util.rx',
    'kahuna.imgops'
]);

image.controller('uiPreviewImageCtrl', [
    '$scope',
    'inject$',
    '$rootScope',
    '$window',
    'imageService',
    'imageUsagesService',
    function (
        $scope,
        inject$,
        $rootScope,
        $window,
        imageService,
        imageUsagesService) {
    var ctrl = this;
    const freeUpdateListener = $rootScope.$on('image-updated', (e, updatedImage) => {
        if (ctrl.image.data.id === updatedImage.data.id) {
            ctrl.states = imageService(updatedImage).states;
            ctrl.image = updatedImage;
        }
    });

    ctrl.states = imageService(ctrl.image).states;

    ctrl.imageDescription = ctrl.states.isStaffPhotographer ?
        `Staff Image: ${ctrl.image.data.metadata.description}` :
        ctrl.image.data.metadata.description;
      const queryTerms = `${ctrl.query()}`.split(" ").filter(_=>_.length > 2);
      const description = ctrl.image.data.metadata.description || ctrl.image.data.metadata.title || '&nbsp;';
      ctrl.descriptionHighlighted = description.split(" ").map(term => {
        const normalisedTerm = term.replace(/[^a-zA-Z0-9]/g, '');
        if (queryTerms.some(queryTerm => (normalisedTerm.localeCompare(queryTerm, undefined, { sensitivity: 'base' }) == 0)))
        {
          return { term, highlight: true };
        }
        return { term };
      });

    ctrl.flagState = ctrl.states.costState;

    const hasPrintUsages$ =
        imageUsagesService.getUsages(ctrl.image).hasPrintUsages$;

    const hasDigitalUsages$ =
        imageUsagesService.getUsages(ctrl.image).hasDigitalUsages$;

    const recentUsages$ = imageUsagesService.getUsages(ctrl.image).recentUsages$;

    $scope.$on('$destroy', function() {
        freeUpdateListener();
    });

    inject$($scope, recentUsages$, ctrl, 'recentUsages');
    inject$($scope, hasPrintUsages$, ctrl, 'hasPrintUsages');
    inject$($scope, hasDigitalUsages$, ctrl, 'hasDigitalUsages');

    ctrl.getCollectionStyle = collection => {
        return collection.data.cssColour && `background-color: ${collection.data.cssColour}`;
    };
}]);

image.directive('uiPreviewImage', function() {
    return {
        restrict: 'E',
        scope: {
            image: '=',
            hideInfo: '=',
            selectionMode: '=',
            query: '&'
        },
        // extra actions can be transcluded in
        transclude: true,
        template: template,
        controller: 'uiPreviewImageCtrl',
        controllerAs: 'ctrl',
        bindToController: true
    };
});

image.directive('uiPreviewImageLarge', ['observe$', 'inject$', 'imgops',
    function(observe$, inject$, imgops) {
        return {
            restrict: 'E',
            scope: {
                image: '=',
                hideInfo: '=',
                selectionMode: '=',
                query: '&'

            },
            // extra actions can be transcluded in
            transclude: true,
            template: templateLarge,
            controller: 'uiPreviewImageCtrl',
            controllerAs: 'ctrl',
            bindToController: true,
            link: function(scope, element, attrs, ctrl) {

                ctrl.loading = false;
                const image$ = new Rx.Subject();

                const optimisedImage$ = image$.flatMap((image) => {
                    return Rx.Observable.fromPromise(imgops.getFullScreenUri(image));
                }).debounce(5);

                scope.$watch(() => ctrl.image.data.id, () => {
                    ctrl.loading = true;
                    image$.onNext(ctrl.image);
                });

                inject$(scope, optimisedImage$, ctrl, 'optimisedImage');

                scope.$watch(() => ctrl.optimisedImage, () => ctrl.loading = false);
            }
        };
}]);

image.directive('grStopPropagation', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            element.on(attrs.grStopPropagation, e => e.stopPropagation());
        }
    };
});
