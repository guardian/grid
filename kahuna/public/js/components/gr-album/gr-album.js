import angular from 'angular';

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
    'imageService',
    'mediaApi',
    'imageAccessor',
    'albumService',

    function(imageService, mediaApi, imageAccessor, albumService) {
        const ctrl = this;

        ctrl.search = (q) => {
            return mediaApi.metadataSearch('album', { q })
                .then(resource => resource.data.map(d => d.key));
        };

        ctrl.save = (title) => {
            if (title.trim().length === 0) {
                return ctrl.remove();
            }

            return albumService.add({ image: ctrl.image, data: { title }})
                .then(updatedImage => {
                    ctrl.image = updatedImage;
                    ctrl.refresh();
                });
        };

        ctrl.remove = () => {
            return albumService.remove({ image: ctrl.image })
                .then(updatedImage => {
                    ctrl.image = updatedImage;
                    ctrl.refresh();
                });
        };

        ctrl.refresh = () => {
            const albumResource = imageAccessor.getAlbum(ctrl.image);
            ctrl.hasAlbumData = !!albumResource.data;
            ctrl.albumData = ctrl.hasAlbumData && albumResource.data;
        };

        ctrl.refresh();
    }
]);

album.directive('grAlbum', [function() {
    return {
        restrict: 'E',
        scope: {
            image: '='
        },
        controller: 'GrAlbumCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template
    };
}]);
