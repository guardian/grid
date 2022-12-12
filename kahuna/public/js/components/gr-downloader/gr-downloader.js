import angular from 'angular';
import './gr-downloader.css';
import template from './gr-downloader.html';
import '../../services/image/downloads';
import { react2angular } from "react2angular";
import {DownloadButton} from "../react/download-button";

export const downloader = angular.module('gr.downloader', [
  'gr.image-downloads.service'
]).component('downloadButton',
  react2angular(DownloadButton,
    ["images"],
    ['imageDownloadsService']
  )
);

downloader.controller('DownloaderCtrl', [
  '$window',
  '$q',
  '$scope',
  '$rootScope',
  'inject$',
  'imageDownloadsService',

  function Controller($window, $q, $scope, $rootScope, inject$, imageDownloadsService) {

    let ctrl = this;

    ctrl.canDownloadCrop = $window._clientConfig.canDownloadCrop;
    const restrictDownload = $window._clientConfig.restrictDownload;


    ctrl.imagesArray = () => Array.isArray(ctrl.images) ?
      ctrl.images : Array.from(ctrl.images.values());
    ctrl.imageCount = () => ctrl.imagesArray().length;

    ctrl.downloadableImagesArray = () => restrictDownload ?
      ctrl.imagesArray().filter(({data, links}) =>
        links?.some(({rel}) => rel === 'download') && data.softDeletedMetadata === undefined) :
      ctrl.imagesArray();

    $scope.$watch('ctrl.images', function () {
      ctrl.singleImageSelected = ctrl.imageCount() === 1;
      ctrl.multipleSelectedAllValid = ctrl.imageCount() > 1;

      if (restrictDownload) {
        const totalSelectedImages = ctrl.imageCount();
        const selectedNonDownloadableImages = ctrl.imagesArray().filter(({data, links}) =>
          !links?.some(({rel}) => rel === 'download') || data.softDeletedMetadata !== undefined);
        const singleImageSelected = totalSelectedImages === 1;
        const multipleImagesSelected = totalSelectedImages > 1;

        ctrl.singleImageSelected = singleImageSelected && ctrl.imagesArray()[0].links?.some(({rel}) => rel === 'download')
          && ctrl.imagesArray()[0].data.softDeletedMetadata === undefined;

        ctrl.singleSelectedInvalid = singleImageSelected && selectedNonDownloadableImages.length === 1;

        ctrl.multipleSelectedAllValid = multipleImagesSelected && selectedNonDownloadableImages.length < 1;
        ctrl.multipleSelectedNoneValid = multipleImagesSelected && totalSelectedImages === selectedNonDownloadableImages.length;
        ctrl.multipleSelectedSomeValid = multipleImagesSelected && !(ctrl.multipleSelectedNoneValid || ctrl.multipleSelectedAllValid);
      }
    });

    ctrl.isDeleted = ctrl.singleImageSelected && ctrl.images[0].data.softDeletedMetadata !== undefined;

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

            const createDownload = () => {
              const url = $window.URL.createObjectURL(blob);
              $window.location = url;
              $window.URL.revokeObjectURL(url);
            };
            createDownload();
            ctrl.downloading = false;
            $scope.$apply();
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


