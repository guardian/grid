import angular from 'angular';
import './gr-downloader.css';
import template from './gr-downloader.html';
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
  '$scope',
  'inject$',
  'imageDownloadsService',

  function Controller($window, $q, $scope, inject$, imageDownloadsService) {

    let ctrl = this;

    ctrl.canDownloadCrop = $window._clientConfig.canDownloadCrop;
    const restrictDownload = $window._clientConfig.restrictDownload;


    ctrl.imagesArray = () => Array.isArray(ctrl.images) ?
      ctrl.images : Array.from(ctrl.images.values());
    ctrl.imageCount = () => ctrl.imagesArray().length;

    ctrl.downloadableImagesArray = () => restrictDownload ? ctrl.imagesArray().filter(image => image.data.valid && image.data.softDeletedMetadata === undefined) : ctrl.imagesArray();

    $scope.$watch('ctrl.images', function () {
      ctrl.singleImageSelected = ctrl.imageCount() === 1;
      ctrl.multipleImagesSelected = ctrl.imageCount() > 1;

      if (restrictDownload) {
        const totalSelectedImages = ctrl.imageCount();
        const selectedNonDownloadableImages = ctrl.imagesArray().filter(image => !image.data.valid || !image.data.softDeletedMetadata === undefined) || [];
        const singleImageSelected = totalSelectedImages === 1;
        const multipleImagesSelected = totalSelectedImages > 1;

        ctrl.multipleImagesSelected = multipleImagesSelected && selectedNonDownloadableImages.length < 1;
        ctrl.singleImageSelected = singleImageSelected && ctrl.imagesArray()[0].data.valid && ctrl.imagesArray()[0].data.softDeletedMetadata === undefined;

        ctrl.multipleSelectedAllValid = multipleImagesSelected && selectedNonDownloadableImages.length < 1;
        ctrl.multipleSelectedSomeValid = multipleImagesSelected && selectedNonDownloadableImages.length && (totalSelectedImages !== selectedNonDownloadableImages.length);
        ctrl.multipleSelectedNoneValid = multipleImagesSelected && totalSelectedImages === selectedNonDownloadableImages.length;
        ctrl.singleSelectedInvalid = singleImageSelected && selectedNonDownloadableImages.length === 1;
      }
    });

    ctrl.isDeleted = ctrl?.images?.length === 1 && ctrl.images[0].data.softDeletedMetadata !== undefined;
    const uris$ = imageDownloadsService.getDownloads(ctrl.imagesArray()[0]);

    inject$($scope, uris$, ctrl, 'firstImageUris');

    ctrl.download = (downloadKey) => {

      ctrl.downloading = true;

      const downloads$ = imageDownloadsService.download$(
        ctrl.downloadableImagesArray(),
        downloadKey || 'downloadUri'
      );

      downloads$.subscribe((zip) => {
          zip.generateAsync({type: 'uint8array'}).then(file => {
            const blob = new Blob([file], {type: 'application/zip'});

            // const isTooBig = blob.size > maxBlobSize;
            const isTooBig = false;

            const createDownload = () => {
              const url = $window.URL.createObjectURL(blob);
              $window.location = url;
              $window.URL.revokeObjectURL(url);
            };

            const refuseDownload = () => {
              const maxSize = bytesToSize(maxBlobSize);
              const blobSize = bytesToSize(blob.size);

              // the things we do for a happy linter...
              const message = [
                'Download is too big!',
                `Max file size: ${maxSize}. Your download: ${blobSize}.`,
                'Consider downloading smaller batches.'
              ].join('\n');

              $window.alert(message);
            };

            if (isTooBig) {
              refuseDownload();
            } else {
              createDownload();
            }

            ctrl.downloading = false;
          });
        },
        (e) => {
          const message = [
            'Something has gone wrong with your download!', e
          ].join('\n');

          $window.alert(message);

          ctrl.downloading = false;
          throw e;
        });
    };

  }]);

downloader.directive('grDownloader', function () {
  return {
    restrict: 'E',
    controller: 'DownloaderCtrl',
    controllerAs: 'ctrl',
    bindToController: true,
    scope: {
      images: '=',
      crop: '='
    },
    template: template
  };
});

