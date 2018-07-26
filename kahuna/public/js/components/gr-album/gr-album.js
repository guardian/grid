import angular from 'angular';

import './gr-album.css';
import template from './gr-album.html';

import '../../image/service';
import '../../services/album';
import '../../services/image-accessor';

export const album = angular.module('gr.album', [
    'gr.image.service',
    'kahuna.services.image-accessor',
    'kahuna.services.album'
]);

album.controller('GrAlbumCtrl', [
    '$rootScope',
    '$scope',
    'imageService',
    'mediaApi',
    'imageAccessor',
    'albumService',

    function($rootScope, $scope, imageService, mediaApi, imageAccessor, albumService) {
        const ctrl = this;

        function refreshForOne() {
            const image = ctrl._images[0];
            const albumResource = imageAccessor.getAlbum(image);
            ctrl.hasAlbumData = !!albumResource.data;
            ctrl.hasSingleAlbum = ctrl.hasAlbumData;
            ctrl.albumData = ctrl.hasAlbumData && albumResource.data || {};
        }

        function refreshForMany() {
            const apiAlbums = ctrl._images.map(image => imageAccessor.getAlbum(image));

            const albums = apiAlbums.reduce((acc, album) => {
                return album.data ? [...acc, album.data] : acc;
            }, []);

            ctrl.hasAlbumData = albums.length > 0;

            if (ctrl.hasAlbumData) {
                const allImagesHaveAlbum = albums.length === ctrl._images.length;
                const uniqueAlbumTitles = new Set(albums.map(album => album.title));

                ctrl.hasSingleAlbum = uniqueAlbumTitles.size === 1 && allImagesHaveAlbum;
                ctrl.albumData = ctrl.hasSingleAlbum ? albums[0] : {};
            }
        }

        function refresh() {
            // `ctrl.images` is a `Set` in multi-select mode, be safe and always have an array
            ctrl._images = Array.from(ctrl.images);
            return ctrl._images.length === 1 ? refreshForOne() : refreshForMany();
        }

        ctrl.search = (q) => {
            return mediaApi.metadataSearch('album', { q })
                .then(resource => resource.data.map(d => d.key));
        };

        ctrl.save = (title) => {
            if (title.trim().length === 0) {
                return ctrl.remove();
            }

            return albumService.batchAdd({ images: ctrl.images, data: { title } })
                .then(images => {
                    // TODO be better! Pretty sure this isn't performant
                    // reassign images to trigger a `refresh` by the `$watchCollection` below
                    ctrl.images = images;
                });
        };

        ctrl.remove = () => {
            return albumService.batchRemove({ images: ctrl.images })
                .then(images => {
                    // TODO be better! Pretty sure this isn't performant
                    // reassign images to trigger a `refresh` by the `$watchCollection` below
                    ctrl.images = images;
                });
        };

        if (Boolean(ctrl.withBatch)) {
            const batchApplyEvent = 'events:batch-apply:album';

            $scope.$on(batchApplyEvent, (e, { title }) => {
                ctrl.save(title);
            });

            ctrl.batchApply = (title) => $rootScope.$broadcast(batchApplyEvent, { title });
        }

        $scope.$watchCollection(() => Array.from(ctrl.images), refresh);
    }
]);

album.directive('grAlbum', [function() {
    return {
        restrict: 'E',
        scope: {
            images: '=',
            withBatch: '=?',
            editInline: '=?'
        },
        controller: 'GrAlbumCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template
    };
}]);
