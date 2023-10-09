import angular from 'angular';

import '../util/rx';
import '../services/image/usages';
import '../image/service';
import '../edits/service';

import '../components/gr-add-keyword/gr-add-keyword';
import '../components/gr-add-label/gr-add-label';
import '../components/gr-photoshoot/gr-photoshoot';
import '../components/gr-syndication-rights/gr-syndication-rights';
import '../components/gr-archiver/gr-archiver';
import '../components/gr-collection-overlay/gr-collection-overlay';
import '../components/gr-crop-image/gr-crop-image';
import '../components/gr-delete-crops/gr-delete-crops';
import '../components/gr-delete-image/gr-delete-image';
import '../components/gr-undelete-image/gr-un-delete-image';
import '../components/gr-downloader/gr-downloader';
import '../components/gr-export-original-image/gr-export-original-image';
import '../components/gr-image-cost-message/gr-image-cost-message';
import '../components/gr-image-metadata/gr-image-metadata';
import '../components/gr-image-usage/gr-image-usage';
import '../components/gr-keyboard-shortcut/gr-keyboard-shortcut';
import '../components/gr-metadata-validity/gr-metadata-validity';
import '../components/gr-display-crops/gr-display-crops';
import '../components/gu-date/gu-date';
import {radioList} from '../components/gr-radio-list/gr-radio-list';
import {cropUtil} from '../util/crop';
import { List } from 'immutable';
const image = angular.module('kahuna.image.controller', [
  'util.rx',
  'kahuna.edits.service',
  'gr.image.service',
  'gr.image-usages.service',

  'gr.addKeyword',
  'gr.addLabel',
  'gr.photoshoot',
  'gr.syndicationRights',
  'gr.archiver',
  'gr.collectionOverlay',
  'gr.cropImage',
  'gr.deleteCrops',
  'gr.deleteImage',
  'gr.undeleteImage',
  'gr.downloader',
  'gr.exportOriginalImage',
  'gr.imageCostMessage',
  'gr.imageMetadata',
  'gr.imageUsage',
  'gr.keyboardShortcut',
  'gr.metadataValidity',
  'gr.displayCrops',
  'gu.date',
  radioList.name,
  cropUtil.name
]);

image.controller('ImageCtrl', [
  '$rootScope',
  '$scope',
  '$element',
  '$state',
  '$stateParams',
  '$window',
  '$filter',
  'inject$',
  'image',
  'mediaApi',
  'optimisedImageUri',
  'lowResImageUri',
  'cropKey',
  'mediaCropper',
  'imageService',
  'imageUsagesService',
  'editsService',
  'keyboardShortcut',
  'cropSettings',
  'globalErrors',


  function ($rootScope,
            $scope,
            $element,
            $state,
            $stateParams,
            $window,
            $filter,
            inject$,
            image,
            mediaApi,
            optimisedImageUri,
            lowResImageUri,
            cropKey,
            mediaCropper,
            imageService,
            imageUsagesService,
            editsService,
            keyboardShortcut,
            cropSettings,
            globalErrors) {

    let ctrl = this;

    keyboardShortcut.bindTo($scope)
      .add({
        combo: 'c',
        description: 'Crop image',
        callback: () => $state.go('crop', {imageId: ctrl.image.data.id})
      })
      .add({
        combo: 'f',
        description: 'Enter fullscreen',
        callback: () => {
          const imageEl = $element[0].querySelector('.easel__image');

          // Fullscreen API has vendor prefixing https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API/Guide#Prefixing
          const fullscreenElement = (
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement
          );

          const exitFullscreen = (
            document.exitFullscreen ||
            document.webkitExitFullscreen ||
            document.mozCancelFullScreen
          );

          const requestFullscreen = (
            imageEl.requestFullscreen ||
            imageEl.webkitRequestFullscreen ||
            imageEl.mozRequestFullScreen
          );

          // `.call` to ensure `this` is bound correctly.
          return fullscreenElement
            ? exitFullscreen.call(document)
            : requestFullscreen.call(imageEl);
        }
      });

    ctrl.tabs = [
      {key: 'metadata', value: 'Metadata'},
      {key: 'usages', value: `Usages`, disabled: true}
    ];

    ctrl.selectedTab = 'metadata';

    ctrl.image = image;
    if (ctrl.image && ctrl.image.data.softDeletedMetadata !== undefined) { ctrl.isDeleted = true; }
    ctrl.optimisedImageUri = optimisedImageUri;
    ctrl.lowResImageUri = lowResImageUri;

    ctrl.singleImageList = ctrl.image ? new List([ctrl.image]) : new List([]);

    editsService.canUserEdit(ctrl.image).then(editable => {
      ctrl.canUserEdit = editable;
    });

    const usages = imageUsagesService.getUsages(ctrl.image);
    const usagesCount$ = usages.count$;

    const recentUsages$ = usages.recentUsages$;

    inject$($scope, usagesCount$, ctrl, 'usagesCount');
    inject$($scope, recentUsages$, ctrl, 'recentUsages');

    const freeUsageCountWatch = $scope.$watch('ctrl.usagesCount', value => {
      const usageTab = ctrl.tabs.find(_ => _.key === 'usages');
      usageTab.value = `Usages (${value > 0 ? value : 'None'})`;
      usageTab.disabled = value === 0;

      // stop watching
      freeUsageCountWatch();
    });

    // TODO: we should be able to rely on ctrl.crop.id instead once
    // all existing crops are migrated to have an id (they didn't
    // initially)
    ctrl.cropKey = cropKey;

    ctrl.cropSelected = cropSelected;

    ctrl.image.allCrops = [];

    cropSettings.set($stateParams);
    ctrl.cropType = cropSettings.getCropType();
    ctrl.capitalisedCropType = ctrl.cropType ?
      ctrl.cropType[0].toUpperCase() + ctrl.cropType.slice(1) :
      '';

    imageService(ctrl.image).states.canDelete.then(deletable => {
      ctrl.canBeDeleted = deletable;
    });

    ctrl.allowCropSelection = (crop) => {
      if (ctrl.cropType) {
        const cropSpec = cropSettings.getCropOptions().find(_ => _.key === ctrl.cropType);
        return crop.specification.aspectRatio === cropSpec.ratioString;
      }

      return true;
    };

    ctrl.shareImage = () => {
       const sharedUrl = $window._clientConfig.rootUri + "/images/" + ctrl.image.data.id;
       navigator.clipboard.writeText(sharedUrl);
       globalErrors.trigger('clipboard', sharedUrl);
    };
    ctrl.onCropsDeleted = () => {
      // a bit nasty - but it updates the state of the page better than trying to do that in
      // the client.
      $state.go('image', {imageId: ctrl.image.data.id, crop: undefined}, {reload: true});
    };

    // TODO: move this to a more sensible place.
    function getCropDimensions() {
      return {
        width: ctrl.crop.specification.bounds.width,
        height: ctrl.crop.specification.bounds.height
      };
    }
    // TODO: move this to a more sensible place.
    function getImageDimensions() {
      return ctrl.image.data.source.dimensions;
    }

    function getImageIdFromCropResource(cropsResource) {
      const imageHref = cropsResource.links.find(link => link.rel == 'image')?.href;
      const hrefTokens = imageHref.split('/');
      const count = hrefTokens.length;
      const imageId = hrefTokens[count - 1];
      return imageId;
    }

    mediaCropper.getCropsFor(image).then(cropsResource => {
      const s3Crops = cropsResource.data;
      const esCrops = image.data.exports;

      const crops = s3Crops.filter( (s3Crop) => {
        return esCrops.find( (esCrop) => {
          return s3Crop.id === esCrop.id && esCrop.assets.every( (esCropAsset)=> {
            return s3Crop.assets.find( (s3CropAsset) => {
              return s3CropAsset.dimensions !== undefined &&
                esCropAsset.dimensions !== undefined &&
                s3CropAsset.dimensions.width === esCropAsset.dimensions.width;
            }) !== undefined;
          });
        }) !== undefined;
      });

      if ($window._clientConfig.canDownloadCrop) {
        crops.forEach((crop) => {
          crop.assets.forEach((asset) =>
            asset.downloadLink = cropsResource.links.find(link => link.rel.includes(`crop-download-${crop.id}-${asset.dimensions.width}`))?.href
          );
          //set the download link of the crop to be the largest asset
          //by ordering the assets in increasing dimension width and picking the last one
          //this way largestAsset can never be undefined
          //this will ensure that asset inconsistency in S3 will still result to a fallback download
          if (crop.assets.length > 0) {
            const largestAsset = crop.assets.sort((a, b) => (a.dimensions.width > b.dimensions.width) ? 1 : -1)[ crop.assets.length - 1];
            const largestWidth = largestAsset.dimensions.width;
            if (largestWidth != crop.master.dimensions.width) {
              const imageId = getImageIdFromCropResource(cropsResource);
              console.log('The largest cropped asset of ' + crop.id + ' available for image ' + imageId +
              ' does not have the same dimensions as the master. Using the next largest cropped asset with width ' + largestWidth +
              'Please correct this inconsistency.');
            }
            crop.downloadLink = largestAsset.downloadLink;
          }
        });
      }
      ctrl.crop = crops.find(crop => crop.id === cropKey);
      ctrl.fullCrop = crops.find(crop => crop.specification.type === 'full');
      ctrl.crops = crops.filter(crop => crop.specification.type === 'crop');
      ctrl.image.allCrops = ctrl.fullCrop ? [ctrl.fullCrop].concat(ctrl.crops) : ctrl.crops;
      //boolean version for use in template
      ctrl.hasFullCrop = angular.isDefined(ctrl.fullCrop);
      ctrl.hasCrops = ctrl.crops.length > 0;
    }).finally(() => {
      ctrl.dimensions = angular.isDefined(ctrl.crop) ?
        getCropDimensions() : getImageDimensions();

      if (angular.isDefined(ctrl.crop)) {
        ctrl.originalDimensions = getImageDimensions();
      }
    });

    function cropSelected(crop) {
      $rootScope.$emit('events:crop-selected', {
        image: ctrl.image,
        crop: crop
      });
    }

    const freeImagesUpdateListener = $rootScope.$on('images-updated', (e, updatedImages) => {
      const maybeUpdatedImage = updatedImages.find(updatedImage => ctrl.image.data.id === updatedImage.data.id);
      if (maybeUpdatedImage) {
        ctrl.image = maybeUpdatedImage;
      }
    });

    const freeImageDeleteListener = $rootScope.$on('images-deleted', () => {
      $state.go('search');
    });

    const freeImageDeleteFailListener = $rootScope.$on('image-delete-failure', (err, image) => {
      if (err && err.body && err.body.errorMessage) {
        $window.alert(err.body.errorMessage);
      } else {
        // Possibly not receiving a proper image object sometimes?
        const imageId = image && image.data && image.data.id || 'Unknown ID';
        $window.alert(`Failed to delete image ${imageId}`);
      }
    });

    $scope.$on('$destroy', function () {
      freeImagesUpdateListener();
      freeImageDeleteListener();
      freeImageDeleteFailListener();
    });
  }]);
