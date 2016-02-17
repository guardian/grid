import angular from 'angular';
import JSZip from 'jszip';
import './gr-downloader.css!';
import Rx from 'rx';
import template from './gr-downloader.html!text';

import '../../services/image/downloads';

export const downloader = angular.module('gr.downloader', [
    'gr.image-downloads.service'
]);

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

downloader.controller('DownloaderCtrl', [
    '$window',
    '$q',
    '$http',
    'imageDownloadsService',

    function Controller($window, $q, $http, imageDownloadsService) {

    let ctrl = this;

    ctrl.download = () => {
        ctrl.downloading = true;

        const downloadObservablesIterable = ctrl.images
            .map((image) => imageDownloadsService.getDownloads(image));

        const downloadObservablesArray = Array.from(
                downloadObservablesIterable.values());

        const downloads$ = Rx.Observable.merge(downloadObservablesArray);

        // TODO: This must be configurable
        const downloadKey = "lowRezUri";

        const zip = new JSZip();
        const imageHttp = url => $http.get(url, { responseType:'arraybuffer' });

        const addDownloadsToZip$ = downloads$
            .flatMap((downloads) => Rx.Observable
                    .fromPromise(imageHttp(downloads.uris[downloadKey]))
                    .map((resp) => zip.file(downloads.filename, resp.data))
            ).toArray();

        const addDownloadsToZipPromise = addDownloadsToZip$.toPromise($q);

        addDownloadsToZipPromise.then(() => {
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

