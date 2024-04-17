import angular from 'angular';
import Rx from 'rx';

import './gr-image-metadata.css';
import template from './gr-image-metadata.html';
import './gr-image-metadata.css';
import '../../image/service';
import '../../edits/service';
import '../gr-description-warning/gr-description-warning';
import '../../util/storage';
import { editOptions, overwrite } from '../../util/constants/editOptions';
import '../../services/image-accessor';
import '../../services/image-list';
import '../../services/label';
import '../../search/query-filter';

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
  'searchWithModifiers',
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
    storage,
    searchWithModifiers) {

    let ctrl = this;

    ctrl.displayMetadataTemplates = window._clientConfig.metadataTemplates !== undefined && window._clientConfig.metadataTemplates.length > 0;
    // Deep copying window._clientConfig.domainMetadataModels
    ctrl.domainMetadataSpecs = JSON.parse(JSON.stringify(window._clientConfig.domainMetadataSpecs));
    ctrl.showUsageRights = false;
    ctrl.metadataUpdatedByTemplate = [];

    ctrl.$onInit = () => {
      $scope.$watchCollection('ctrl.selectedImages', function () {
        ctrl.singleImage = singleImage();
        ctrl.selectedLabels = selectedLabels();
        ctrl.usageRights = selectedUsageRights();
        inject$($scope, Rx.Observable.fromPromise(selectedUsageCategory(ctrl.usageRights)), ctrl, 'usageCategory');
        ctrl.rawMetadata = rawMetadata();
        ctrl.metadata = displayMetadata();
        ctrl.metadata.dateTaken = ctrl.displayDateTakenMetadata();
        ctrl.newPeopleInImage = "";
        ctrl.newKeywords = "";
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

      ctrl.displayDateTakenMetadata = function () {
        let dateTaken = ctrl.metadata.dateTaken ? new Date(ctrl.metadata.dateTaken) : undefined;
        if (dateTaken) {
          dateTaken.setSeconds(0, 0);
        }
        return dateTaken;
      };

      ctrl.credits = function (searchText) {
        return ctrl.metadataSearch('credit', searchText);
      };

      ctrl.metadataSearch = (field, q) => {
        return mediaApi.metadataSearch(field, {q}).then(resource => {
          return resource.data.map(d => d.key);
        });
      };

      ctrl.descriptionOption = overwrite.key;

      ctrl.descriptionOptions = editOptions;

      ctrl.updateDescriptionField = function () {
        ctrl.updateMetadataField('description', ctrl.metadata.description);
      };

      ctrl.updateLocationField = function (data, value) {
        Object.keys(value).forEach(key => {
          if (value[key] === undefined) {
            delete value[key];
          }
        });
        ctrl.updateMetadataField('location', value);
      };

      ctrl.updateMetadataField = function (field, value) {
        var imageArray = Array.from(ctrl.selectedImages);
        if (field === 'dateTaken') {
          value = value.toISOString();
        }
        if (field === 'peopleInImage') {
          ctrl.addPersonToImages(imageArray, value);
          return;
        }
        if (field === 'keywords') {
          ctrl.addKeywordToImages(imageArray, value);
          return;
        }
        return editsService.batchUpdateMetadataField(
          imageArray,
          field,
          value,
          ctrl.descriptionOption
        );
      };

      ctrl.updateDomainMetadataField = function (name, field, value) {
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

      ctrl.addLabelToImages = labelService.batchAdd;
      ctrl.removeLabelFromImages = labelService.batchRemove;
      ctrl.labelAccessor = (image) => imageAccessor.readLabels(image).map(label => label.data);

      const updateImages = (images, metadataFieldName, valueFn) => {
        images.map((image) => {
          editsService.batchUpdateMetadataField(
            [image],
            metadataFieldName,
            valueFn(image),
            ctrl.descriptionOption
          );
        });
        return Promise.resolve(ctrl.selectedImages);
      };
      const removeXFromImages = (metadataFieldName, accessor) => (images, removedX) =>
        updateImages(
          images,
          metadataFieldName,
          (image) => accessor(image)?.filter((x) => x !== removedX) || []
        );
      const addXToImages = (metadataFieldName, accessor) => (images, addedX) =>
        updateImages(
          images,
          metadataFieldName,
          (image) => {
            const currentXInImage = accessor(image);
            return currentXInImage ? [...currentXInImage, addedX] : [addedX];
          }
        );

      ctrl.peopleAccessor = (image) => imageAccessor.readPeopleInImage(image);
      ctrl.removePersonFromImages = removeXFromImages('peopleInImage', ctrl.peopleAccessor);
      ctrl.addPersonToImages = addXToImages('peopleInImage', ctrl.peopleAccessor);

      ctrl.keywordAccessor = (image) => imageAccessor.readMetadata(image).keywords;
      ctrl.removeKeywordFromImages = removeXFromImages('keywords', ctrl.keywordAccessor);
      ctrl.addKeywordToImages = addXToImages('keywords', ctrl.keywordAccessor);

      ctrl.subjectsAccessor = (image) => imageAccessor.readMetadata(image).subjects;

      ctrl.selectedImagesHasAny = (accessor) => ctrl.selectedImages.find(
        (image) => Object.keys(accessor(image)).length > 0
      );

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
            .map(([key, value]) => {
              let fieldAlias = ctrl.fieldAliases.find(_ => _.alias === key);
              if (fieldAlias && fieldAlias.displayInAdditionalMetadata === true) {
                return [fieldAlias.label, {value, alias: fieldAlias.alias}];
              }
            })
            .filter(_ => _ !== undefined));

        registerSectionStore('additionalMetadata');

        ctrl.domainMetadata = ctrl.domainMetadataSpecs
          .filter(domainMetadataSpec => domainMetadataSpec.fields.length > 0)
          .reduce((acc, domainMetadataSpec) => {
            let domainMetadata = {...domainMetadataSpec};

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
              return {value: option, text: option};
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

      ctrl.srefNonfree = () => storage.getJs("isNonFree", true) ? true : undefined;

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
        if (ctrl.selectedImages.size === 1) {
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
            case 0:
              return undefined;
            case 1:
              return values.first();
            default:
              return Array.from(values);
          }
        }).toObject();
      }

      function displayMetadata() {
        return selectedMetadata().map((values) => {
          switch (values.size) {
            case 1:
              return values.first();
            default:
              return undefined;
          }
        }).toObject();
      }

      function extraInfo() {
        const info = imageList.getExtraInfo(ctrl.selectedImages);
        const properties = imageList.getSetOfProperties(info);
        return properties.map((values) => {
          switch (values.size) {
            case 0:
              return undefined;
            case 1:
              return values.first();
            default:
              return Array.from(values);
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

      ctrl.locationFieldPluralMap = {
        'subLocation': 'subLocations',
        'city': 'cities',
        'state': 'states',
        'country': 'countries'
      };

      ctrl.fieldAliases = $window._clientConfig.fieldAliases;

      ctrl.removeImageFromCollection = (collection) => {
        ctrl.removingCollection = collection;
        collections.removeImageFromCollection(collection, ctrl.singleImage)
          .then(() => ctrl.removingCollection = false);
      };

      $scope.$on('$destroy', function () {
        freeUpdateListener();
      });

      ctrl.onMetadataTemplateSelected = (metadata, usageRights, collection, leasesWithConfig) => {
        ctrl.collectionUpdatedByTemplate = false;
        ctrl.leasesUpdatedByTemplate = false;
        ctrl.showUsageRights = false;
        ctrl.usageRightsUpdatedByTemplate = false;
        ctrl.usageRights.first().data = usageRights;

        if (angular.isDefined(metadata)) {
          ctrl.metadataUpdatedByTemplate = Object.keys(metadata).filter(key => ctrl.rawMetadata[key] !== metadata[key]);
          ctrl.metadata = metadata;
        }

        if (angular.isDefined(leasesWithConfig)) {
          const leasesFromTemplate = leasesWithConfig.leases.map(lease => {
            return {...lease, fromTemplate: true};
          });
          ctrl.updatedLeases = [...leasesFromTemplate, ...(leasesWithConfig.replace ? [] : ctrl.singleImage.data.leases.data.leases)];
          ctrl.leasesUpdatedByTemplate = true;
        }

        if (angular.isDefined(collection)) {
          if (ctrl.singleImage.data.collections.filter(r => r.data.path.toString() === collection.data.fullPath.toString()).length === 0) {
            ctrl.updatedCollections = [
              {description: collection.data.data.description, fromTemplate: true},
              ...ctrl.singleImage.data.collections.map(resource => resource.data)
            ];

            ctrl.collectionUpdatedByTemplate = true;
          }
        }

        if (usageRights.category !== undefined) {
          if ((ctrl.singleImage.data.usageRights === undefined) ||
            (ctrl.singleImage.data.usageRights.category !== usageRights.category)) {
            ctrl.showUsageRights = true;
          }
        }

        const originalUsageRights = ctrl.singleImage.data.usageRights ? ctrl.singleImage.data.usageRights : {};
        if (angular.equals(usageRights, originalUsageRights) === false) {
          ctrl.usageRightsUpdatedByTemplate = true;
        }
      };

      ctrl.onMetadataTemplateApplying = (leases) => {
        if (angular.isDefined(leases)) {
          ctrl.leasesUpdatingByTemplate = true;
        }
      };

      ctrl.onMetadataTemplateApplied = () => {
        ctrl.collectionUpdatedByTemplate = false;
        ctrl.leasesUpdatedByTemplate = false;
        ctrl.leasesUpdatingByTemplate = false;
        ctrl.showUsageRights = false;
        ctrl.usageRightsUpdatedByTemplate = false;
        ctrl.metadataUpdatedByTemplate = [];
      };

      ctrl.onMetadataTemplateCancelled = (metadata, usageRights) => {
        ctrl.collectionUpdatedByTemplate = false;
        ctrl.leasesUpdatedByTemplate = false;
        ctrl.metadataUpdatedByTemplate = [];
        ctrl.showUsageRights = false;
        ctrl.usageRightsUpdatedByTemplate = false;
        ctrl.metadata = metadata;
        ctrl.usageRights.first().data = usageRights;
      };

      ctrl.isDomainMetadataEmpty = (key) => {
        return ctrl.domainMetadata.find(obj => obj.name === key).fields.every(field => field.value === undefined);
      };

      ctrl.isAdditionalMetadataEmpty = () => {
        const totalAdditionalMetadataCount = Object.keys(ctrl.metadata).filter(key => ctrl.isUsefulMetadata(key)).length +
          Object.keys(ctrl.additionalMetadata).length +
          Object.keys(ctrl.identifiers).length;

        return totalAdditionalMetadataCount == 0;
      };

      ctrl.searchWithModifiers = searchWithModifiers;
    };
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
