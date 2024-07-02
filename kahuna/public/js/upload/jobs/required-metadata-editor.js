import angular from 'angular';
import './required-metadata-editor.css';
import 'angular-elastic';
import template from './required-metadata-editor.html';

import '../../edits/service';
import '../../forms/datalist';
import '../../components/gr-description-warning/gr-description-warning';

import strings from '../../strings.json';

export var jobs = angular.module('kahuna.upload.jobs.requiredMetadataEditor', [
    'kahuna.edits.service',
    'kahuna.forms.datalist',
    'monospaced.elastic',
    'gr.descriptionWarning'
]);


jobs.controller('RequiredMetadataEditorCtrl',
                ['$rootScope', '$scope', '$window', 'mediaApi', 'editsService',
                 function($rootScope, $scope, $window, mediaApi, editsService) {

    var ctrl = this;

    ctrl.$onInit = () => {
      ctrl.institution = strings.institution;
      editsService.canUserEdit(ctrl.image).then(editable => {
          ctrl.userCanEdit = editable;
      });
      ctrl.saving = false;
      ctrl.disabled = () => Boolean(ctrl.saving || ctrl.externallyDisabled);
      ctrl.saveOnTime = 750; // ms
      // We do this check to ensure the copyright field doesn't disappear
      // if we set it to "".
      ctrl.copyrightWasInitiallyThere = !!ctrl.originalMetadata.copyright;
      ctrl.metadataUpdatedByTemplate = [];

      ctrl.save = function() {
          ctrl.saving = true;

          // If there has been a change in the metadata, save it as an override
          var cleanMetadata = {};
          let hasKeywords = false;
          Object.keys(ctrl.metadata).forEach(key => {
              if (ctrl.metadata[key] !== ctrl.saveWhenChangedFrom[key]) {
                  cleanMetadata[key] = ctrl.metadata[key] || '';
              }
              if (key === 'keywords') { hasKeywords = true; }
          });

          //-keep keywords if present and not being updated-
          if (ctrl.resource.data.keywords && !hasKeywords) {
              cleanMetadata['keywords'] = ctrl.resource.data.keywords;
          }

          editsService.
              update(ctrl.resource, cleanMetadata, ctrl.image).
              then(resource => {
                  ctrl.resource = resource;
              }).
              finally(() => ctrl.saving = false);
      };

      ctrl.metadataSearch = (field, q) => {
          return mediaApi.metadataSearch(field,  { q }).then(resource => {
              return resource.data.map(d => d.key);
          });
      };

      ctrl.currentMetadata = () => {
        let cleanMetadata = {};
        Object.keys(ctrl.metadata).forEach(key => {
          if (ctrl.metadata[key] !== ctrl.saveWhenChangedFrom[key]) {
            cleanMetadata[key] = ctrl.metadata[key] || '';
          }
        });
       return cleanMetadata;
      };

      $scope.$on('events:metadata-template:template-selected', (e, { metadata } ) => {
        if (ctrl.userCanEdit && angular.isDefined(metadata)) {
          ctrl.metadataUpdatedByTemplate = Object.keys(metadata).filter(key => ctrl.originalMetadata[key] !== metadata[key]);
          ctrl.metadata = metadata;
        } else {
          ctrl.metadata = ctrl.originalMetadata;
        }
      });

      $scope.$on('events:metadata-template:template-applied', () => {
        ctrl.metadataUpdatedByTemplate = [];
      });

      $scope.$on('events:metadata-template:template-cancelled', (e, {metadata}) => {
        ctrl.metadataUpdatedByTemplate = [];
        ctrl.metadata = metadata;
      });

      // As we make a copy of this, we need to watch it
      // in case the metadata changes from above.
      $scope.$watch(() => ctrl.originalMetadata, metadata =>
          ctrl.metadata = metadataFromOriginal(metadata));

      // TODO: Find a way to broadcast more selectively
      const batchApplyMetadataEvent = 'events:batch-apply:metadata';

      if (Boolean(ctrl.withBatch)) {
          $scope.$on(batchApplyMetadataEvent, (e, { field, data }) => {
              if (ctrl.userCanEdit) {
                  ctrl.metadata[field] = data;
                  ctrl.save();
              }
          });

          ctrl.batchApplyMetadata = field =>
              $rootScope.$broadcast(batchApplyMetadataEvent, { field, data: ctrl.metadata[field] });
      }

      function metadataFromOriginal(originalMetadata) {
          // we only want a subset of the data
          return {
              byline: originalMetadata.byline,
              credit: originalMetadata.credit,
              copyright: originalMetadata.copyright,
              specialInstructions: originalMetadata.specialInstructions,
              description: originalMetadata.description,
              domainMetadata: originalMetadata.domainMetadata,
              usageInstructions: originalMetadata.usageInstructions
          };
      }
    };
}]);

jobs.directive('uiRequiredMetadataEditor', [function() {
    return {
        restrict: 'E',
        scope: {
            resource: '=',
            originalMetadata: '=metadata',
            externallyDisabled: '=?disabled',
            saveWhenChangedFrom: '=',
            // TODO: remove this once we add links to the resources
            image: '=',
            withBatch: '=?'
        },
        controller: 'RequiredMetadataEditorCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);

jobs.controller('DescriptionPlaceholderCtrl',
                ['$scope',
                 function($scope) {

    $scope.funnyDescription = 'Give some context about the image including who, what, where, when and why';

}]);
