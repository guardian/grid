import angular from 'angular';
import JSZip from 'jszip';

export const downloader = angular.module('gr.downloader', []);

downloader.controller('DownloaderCtrl', ['$window', '$q', function Controller($window, $q) {

    let ctrl = this;

    ctrl.download = () => {
        //$window.performance.mark('image-download:start');

        const zip = new JSZip();
        const imagesAddedToZip = ctrl.images.map((image, index) =>
            createImageBufferFromUrl(
                image.data.source.secureUrl,
                image.data.source.dimensions
            ).then(buffer => {
                zip.file(index + '.jpg', buffer);
            })
        );

        $q.all(imagesAddedToZip).then(() => {
            const file = zip.generate({ type: 'uint8array' });
            const blob = new Blob([file], { type: 'application/zip' });
            const url = URL.createObjectURL(blob);

            window.location = url;

            //$window.performance.mark('image-download:end');
            //$window.performance.measure('image-download:time', 'image-download:start', 'image-download:end');
        });
    };

    function getLoadedImageElement(url) {
        const deferred = $q.defer();
        const imageEl = document.createElement('img');
        imageEl.setAttribute('crossOrigin', 'anonymous');
        imageEl.src = url;

        imageEl.addEventListener('load', () => {
            deferred.resolve(imageEl);
        });

        return deferred.promise;
    }

    function createBuffer(imageEl, { width, height }) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageEl, 0, 0);

        return ctx.getImageData(0, 0, width, height).data.buffer;
    }

    function createImageBufferFromUrl(url, { width, height }) {
        return getLoadedImageElement(url).then(imageEl => createBuffer(imageEl, { width, height }));
    }

}]);

downloader.directive('grDownloader', function() {
    return {
        restrict: 'E',
        controller: 'DownloaderCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            images: '=grImages' // crappy two way binding
        },
        template: `<a href="#download" ng:click="ctrl.download()">Download the files</a>`
    }
});

