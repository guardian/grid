import angular from 'angular';
import JSZip from 'jszip';
import './downloader.css!';
import template from './downloader.html!text';

export const downloader = angular.module('gr.downloader', []);

// blob URLs have a max size of 500MB - https://github.com/eligrey/FileSaver.js/#supported-browsers
const maxBlobSize = 500 * 1024 * 1024;

const bytesToSize = (bytes) => {
    if (bytes === 0) {
        return '0 Bytes';
    }

    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return i === 0 ?
        `${bytes} ${sizes[i]}` :
        `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

downloader.controller('DownloaderCtrl',
                     ['$window', '$q', '$http',
                     function Controller($window, $q, $http) {

    let ctrl = this;

    ctrl.download = () => {
        ctrl.downloading = true;

        const zip = new JSZip();
        const imageHttp = url => $http.get(url, { responseType:'arraybuffer' });
        const imagesAddedToZip = Array.from(ctrl.images.values()).map(image =>
            imageHttp(image.data.source.secureUrl)
                .then(resp => zip.file(imageName(image), resp.data))
        );

        $q.all(imagesAddedToZip).then(() => {
            const file = zip.generate({ type: 'uint8array' });
            const blob = new Blob([file], { type: 'application/zip' });

            if (blob.size <= maxBlobSize) {
                const url = $window.URL.createObjectURL(blob);
                $window.location = url;
            }
            else {
                const maxSize = bytesToSize(maxBlobSize);
                const blobSize = bytesToSize(blob.size);

                // the things we do for a happy linter...
                const message = [
                    'Download is too big!',
                    `Max file size: ${maxSize}. Your download: ${blobSize}.`,
                    'Consider downloading smaller batches.'
                ].join('\n');

                $window.alert(message);
            }
        }).finally(() => {
            ctrl.downloading = false;
        });
    };

    ctrl.getFirstImageSource = () => Array.from(ctrl.images)[0].data.source;

    function imageName(image) {
        return image.data.uploadInfo.filename || `${image.data.id}.jpg`;
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
        template: template
    };
});

