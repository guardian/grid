import angular from 'angular';
import JSZip from 'jszip';
import './downloader.css!';
export const downloader = angular.module('gr.downloader', []);

downloader.controller('DownloaderCtrl',
                     ['$window', '$q', '$http',
                     function Controller($window, $q, $http) {

    let ctrl = this;

    ctrl.download = () => {
        const zip = new JSZip();
        const imageHttp = url => $http.get(url, { responseType:'arraybuffer' });
        const imagesAddedToZip = Array.from(ctrl.images.values()).map(image =>
            imageHttp(image.data.source.secureUrl)
                .then(resp => zip.file(imageName(image), resp.data))
        );

        $q.all(imagesAddedToZip).then(() => {
            const file = zip.generate({ type: 'uint8array' });
            const blob = new Blob([file], { type: 'application/zip' });
            const url = $window.URL.createObjectURL(blob);

            $window.location = url;
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
        template: `
            <button class="download" ng:if="ctrl.images.size > 1"
                type="button" title="Download images" ng:click="ctrl.download()">
                <gr-icon-label gr-icon="file_download">Download</gr-icon-label>
            </button>
            <a class="download" ng:if="ctrl.images.size == 1"
                href="{{ ctrl.getFirstImageSource() | assetFile }}" download target="_blank">
                <gr-icon-label gr-icon="file_download">Download</gr-icon-label>
            </a>`
    };
});

