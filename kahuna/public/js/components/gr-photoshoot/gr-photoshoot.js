import angular from 'angular';

import './gr-photoshoot.css';
import template from './gr-photoshoot.html';

import '../../image/service';
import '../../services/photoshoot';
import '../../services/image-accessor';

export const photoshoot = angular.module('gr.photoshoot', [
    'gr.image.service',
    'kahuna.services.image-accessor',
    'kahuna.services.photoshoot'
]);

photoshoot.controller('GrPhotoshootCtrl', [
    '$rootScope',
    '$scope',
    'imageService',
    'mediaApi',
    'imageAccessor',
    'photoshootService',

    function($rootScope, $scope, imageService, mediaApi, imageAccessor, photoshootService) {
        const ctrl = this;

        function refreshForOne() {
            const image = ctrl._images[0];
            const photoshootResource = imageAccessor.getPhotoshoot(image);
            ctrl.hasPhotoshootData = !!photoshootResource.data;
            ctrl.hasSinglePhotoshoot = ctrl.hasPhotoshootData;
            ctrl.photoshootData = ctrl.hasPhotoshootData && photoshootResource.data || {};
        }

        function refreshForMany() {
            const apiPhotoshoots = ctrl._images.map(image => imageAccessor.getPhotoshoot(image));

            const photoshoots = apiPhotoshoots.reduce((acc, photoshoot) => {
                return photoshoot.data ? [...acc, photoshoot.data] : acc;
            }, []);

            ctrl.hasPhotoshootData = photoshoots.length > 0;

            if (ctrl.hasPhotoshootData) {
                const allImagesHavePhotoshoot = photoshoots.length === ctrl._images.length;
                const uniqueTitles = new Set(photoshoots.map(p => p.title));

                ctrl.hasSinglePhotoshoot = uniqueTitles.size === 1 && allImagesHavePhotoshoot;
                ctrl.photoshootData = ctrl.hasSinglePhotoshoot ? photoshoots[0] : {};
            }
        }

        function refresh() {
            // `ctrl.images` is a `Set` in multi-select mode, be safe and always have an array
            ctrl._images = Array.from(ctrl.images);
            return ctrl._images.length === 1 ? refreshForOne() : refreshForMany();
        }

        ctrl.search = (q) => {
            return mediaApi.metadataSearch('photoshoot', { q })
                .then(resource => resource.data.map(d => d.key));
        };

        ctrl.save = (title) => {
            if (title.trim().length === 0) {
                return ctrl.remove();
            }

            return photoshootService.batchAdd({ images: ctrl.images, data: { title } });
        };

        ctrl.remove = () => {
            return photoshootService.batchRemove({ images: ctrl.images });
        };

        if (Boolean(ctrl.withBatch)) {
            const batchApplyEvent = 'events:batch-apply:photoshoot';

            $scope.$on(batchApplyEvent, (e, { title }) => {
                ctrl.photoshootData.title = title;
                ctrl.save(title);
            });

            ctrl.batchApply = (title) => $rootScope.$broadcast(batchApplyEvent, { title });
        }

        $scope.$watchCollection(() => Array.from(ctrl.images), refresh);
    }
]);

photoshoot.directive('grPhotoshoot', [function() {
    return {
        restrict: 'E',
        scope: {
            images: '=',
            withBatch: '=?',
            editInline: '=?'
        },
        controller: 'GrPhotoshootCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template
    };
}]);
