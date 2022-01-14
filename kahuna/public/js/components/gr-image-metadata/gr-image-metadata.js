import angular from 'angular';
import Rx from 'rx';

import template from './gr-image-metadata.html';

import '../../image/service';
import '../../edits/service';
import '../gr-description-warning/gr-description-warning';
import { editOptions, overwrite } from '../../util/constants/editOptions';
import '../../util/storage';
import '../../services/image-accessor';
import '../../services/image-list';
import '../../services/label';
import { List } from 'immutable';

export const module = angular.module('gr.imageMetadata', [
    'gr.image.service',
    'kahuna.edits.service',
    'gr.descriptionWarning',
    'util.storage'
]);

module.controller('grImageMetadataCtrl', [
  '$rootScope',
  '$scope',
  '$window',
  'editsService',
  'mediaApi',
  'editsApi',
  'collections',
  'imageList',
  'imageAccessor',
  'inject$',
  'labelService',
  'storage',


  function ($rootScope,
    $scope,
    $window,
    editsService,
    mediaApi,
    editsApi,
    collections,
    imageList,
    imageAccessor,
    inject$,
    labelService,
    storage) {

    let ctrl = this;

    // Deep copying window._clientConfig.domainMetadataModels
    ctrl.domainMetadataSpecs = JSON.parse(JSON.stringify(window._clientConfig.domainMetadataSpecs));
    ctrl.showUsageRights = false;
    $scope.$watchCollection('ctrl.selectedImages', function() {
      ctrl.singleImage = singleImage();
      ctrl.selectedLabels = selectedLabels();
      ctrl.usageRights = selectedUsageRights();
      inject$($scope, Rx.Observable.fromPromise(selectedUsageCategory(ctrl.usageRights)), ctrl, 'usageCategory');
      ctrl.rawMetadata = rawMetadata();
      ctrl.metadata = displayMetadata();
      ctrl.extraInfo = extraInfo();
      if (ctrl.singleImage) {
        updateSingleImage();
      }

    });

    const freeUpdateListener = $rootScope.$on('images-updated',
    (e, updatedImages) => updateHandler(updatedImages));

    const updateHandler = (updatedImages) => {
      ctrl.selectedImages = new List(updatedImages);
    };

    ctrl.hasMultipleValues = (val) => Array.isArray(val) && val.length > 1;

    ctrl.credits = function(searchText) {
      return ctrl.metadataSearch('credit', searchText);
    };

    ctrl.metadataSearch = (field, q) => {
      return mediaApi.metadataSearch(field,  { q }).then(resource => {
        return resource.data.map(d => d.key);
      });
    };

    ctrl.descriptionOption = overwrite.key;

    ctrl.descriptionOptions = editOptions;

    ctrl.updateDescriptionField = function() {
      ctrl.updateMetadataField('description', ctrl.metadata.description);
    };

    ctrl.updateMetadataField = function (field, value) {
      var imageArray = Array.from(ctrl.selectedImages);

      return editsService.batchUpdateMetadataField(
        imageArray,
        field,
        value,
        ctrl.descriptionOption
      );
    };

    ctrl.updateDomainMetadataField = function(name, field, value) {
      return editsService.updateDomainMetadataField(ctrl.singleImage, name, field, value)
        .then((updatedImage) => {
          if (updatedImage) {
            ctrl.singleImage = updatedImage;
            $rootScope.$emit(
              'track:event',
              'Metadata',
              'Edit',
              'Success',
              null,
              {
                field: field,
                value: value
              }
            );
          }
        })
        .catch(() => {
          $rootScope.$emit(
            'track:event',
            'Metadata',
            'Edit',
            'Failure',
            null,
            {
              field: field,
              value: value
            }
          );
          /*
           Save failed.
           Per the angular-xeditable docs, returning a string indicates an error and will
           not update the local model, nor will the form close (so the edit is not lost).
           Instead, a message is shown and the field keeps focus for user to edit again.
           http://vitalets.github.io/angular-xeditable/#onbeforesave
           */
          return 'failed to save (press esc to cancel)';
        });
    };

    ctrl.addLabel = function (label) {
      var imageArray = Array.from(ctrl.selectedImages);
      labelService.batchAdd(imageArray, [label]);
    };

    ctrl.removeLabel = function (label) {
      var imageArray = Array.from(ctrl.selectedImages);
      labelService.batchRemove(imageArray, label);
    };

    const ignoredMetadata = [
      'title', 'description', 'copyright', 'keywords', 'byline',
      'credit', 'subLocation', 'city', 'state', 'country',
      'dateTaken', 'specialInstructions', 'subjects', 'peopleInImage',
      'domainMetadata'
    ];

    function updateSingleImage() {
      // Alias for convenience in view
      ctrl.identifiers = ctrl.singleImage.data.identifiers;

      ctrl.additionalMetadata = Object.fromEntries(
        Object.entries(ctrl.singleImage.data.aliases)
          .map(([key, val]) => {
            let fieldAlias = ctrl.fieldAliases.find(_ => _.alias === key);
            if (fieldAlias && fieldAlias.displayInAdditionalMetadata === true) {
              console.log(`adding field alias ${key} / ${fieldAlias.label} to additionalmetadata`);
              return [fieldAlias.label, val];
            }
            console.log(`dropping field alias ${key} from additionalmetadata`);
          })
          .filter(_ => _ !== undefined));

      registerSectionStore('additionalMetadata');

      ctrl.domainMetadata = ctrl.domainMetadataSpecs
        .filter(domainMetadataSpec => domainMetadataSpec.fields.length > 0)
        .reduce((acc, domainMetadataSpec) => {
          let domainMetadata = { ...domainMetadataSpec };

          if (ctrl.singleImage.data.metadata) {
            const imageDomainMetadata = ctrl.singleImage.data.metadata.domainMetadata ? ctrl.singleImage.data.metadata.domainMetadata : {};
            domainMetadata.fields = domainMetadataSpec.fields.map(field => setDomainMetadataFieldValueOrDefault(imageDomainMetadata, field, domainMetadataSpec));
          }

          acc.push(domainMetadata);

          return acc;
        }, []);

      ctrl.domainMetadata.forEach(domainMetadata => registerSectionStore(domainMetadata.name));
    }

    const registerSectionStore = (key) => {
      const storeName = generateStoreName(key);
      const state = storage.getJs(storeName) || {hidden: true};
      storage.setJs(storeName, state);
    };

    const generateStoreName = (key) => `${key}MetadataSection`;

    function setDomainMetadataFieldValueOrDefault(domainMetadata, field, spec) {
      let fieldValue = undefined;

      if (field.fieldType === 'datetime' && fieldValue) {
        fieldValue = new Date(fieldValue);
      }

      if (field.fieldType === 'select' && field.options.length > 0) {
        field.selectOptions = field.options
          .filter(option => option)
          .map(option => {
            return { value: option, text: option };
          });
      }

      if (domainMetadata.hasOwnProperty(spec.name)) {
        fieldValue = domainMetadata[spec.name][field.name];

        if (field.fieldType === 'select' && fieldValue) {
          field.selectOptions = [{value: "", text: ""}].concat(field.selectOptions);
        }
      }

      return {
        ...field,
        value: fieldValue
      };
    }

    ctrl.showMetadataSection = (key) => {
      const storeName = generateStoreName(key);
      const state = storage.getJs(storeName);
      storage.setJs(storeName, {hidden: !state.hidden});
    };

    ctrl.isMetadataSectionHidden = (key) => {
      return storage.getJs(generateStoreName(key)).hidden;
    };

    function isUsefulMetadata(metadataKey) {
      return ignoredMetadata.indexOf(metadataKey) === -1;
    }

    ctrl.isUsefulMetadata = isUsefulMetadata;

    function hasLocationInformation() {
      return ctrl.metadata && (
        ctrl.metadata.subLocation ||
        ctrl.metadata.city ||
        ctrl.metadata.state ||
        ctrl.metadata.country
      );
    }

    ctrl.hasLocationInformation = hasLocationInformation;

    function singleImage() {
      if (ctrl.selectedImages.size === 1){
        return ctrl.selectedImages.first();
      }
    }

    function selectedLabels() {
      const labels = imageList.getLabels(ctrl.selectedImages);
      return imageList.getOccurrences(labels);
    }

    function selectedUsageRights() {
      return ctrl.selectedImages.map(image => {
        return {
          image: image,
          data: imageAccessor.readUsageRights(image)
        };
      });
    }

    function selectedUsageCategory(usageRights) {
      const categoriesPromise = editsApi.getUsageRightsCategories();
      return categoriesPromise.then(categories => {
        const categoryCode = usageRights.reduce((m, o) => {
          return (m == o.data.category) ? o.data.category : 'multiple categories';
        }, usageRights && usageRights.first().data.category);

        const usageCategory = categories.find(cat => cat.value === categoryCode);
        return usageCategory ? usageCategory.name : categoryCode;
      });
    }

    function selectedMetadata() {
      const metadata = imageList.getMetadata(ctrl.selectedImages);
      return imageList.getSetOfProperties(metadata);
    }

    function rawMetadata() {
      return selectedMetadata().map((values) => {
        switch (values.size) {
          case 0:  return undefined;
          case 1:  return values.first();
          default: return Array.from(values);
        }
      }).toObject();
    }

    function displayMetadata() {
      return selectedMetadata().map((values) => {
        switch (values.size) {
          case 1:  return values.first();
          default: return undefined;
        }
      }).toObject();
    }

    function extraInfo() {
      const info = imageList.getExtraInfo(ctrl.selectedImages);
      const properties = imageList.getSetOfProperties(info);
      return properties.map((values) => {
        switch (values.size) {
          case 0:  return undefined;
          case 1:  return values.first();
          default: return Array.from(values);
        }
      }).toObject();
    }

    ctrl.displayLeases = () => ctrl.userCanEdit || (ctrl.singleImage && imageAccessor.readLeases(ctrl.singleImage).leases.length > 0);

    // Map of metadata location field to query filter name
    ctrl.locationFieldMap = {
      'subLocation': 'location',
      'city': 'city',
      'state': 'state',
      'country': 'country'
    };

    ctrl.fieldAliases = $window._clientConfig.fieldAliases;

    ctrl.removeImageFromCollection = (collection) => {
      ctrl.removingCollection = collection;
      collections.removeImageFromCollection(collection, ctrl.singleImage)
          .then(() => ctrl.removingCollection = false);
    };

    $scope.$on('$destroy', function() {
        freeUpdateListener();
    });
}
]);

module.directive('grImageMetadata', [function () {
    return {
        restrict: 'E',
        template: template,
        transclude: true,
        scope: {
            selectedImages: '=grImages',
            userCanEdit: '=grUserCanEdit'
        },
        controller: 'grImageMetadataCtrl',
        controllerAs: 'ctrl',
        bindToController: true
    };
}]);
