import angular from 'angular';
import template from './metadata-templates.html';

import '../util/rx';

import './metadata-templates.css';

import '../edits/service';
import {collectionsApi} from '../services/api/collections-api';

export const metadataTemplates = angular.module('kahuna.edits.metadataTemplates', [
  'kahuna.edits.service',
  collectionsApi.name,
  'util.rx'
]);

metadataTemplates.controller('MetadataTemplatesCtrl', [
  '$scope',
  '$window',
  'editsService',
  'collections',
  function ($scope, $window, editsService, collections) {

  let ctrl = this;

  ctrl.templateSelected = false;
  ctrl.metadataTemplates = window._clientConfig.metadataTemplates;

  const filterNonEmpty = (list) => list.filter(s => (typeof s === 'string' && s !== "" && s !== " "));

  function resolve(strategy, originalValue, changeToApply) {
    if (strategy === 'replace') {
      return changeToApply;
    } else if (strategy === 'append') {
      return filterNonEmpty([originalValue, changeToApply]).join(' ');
    } else if (strategy === 'prepend') {
      return filterNonEmpty([changeToApply, originalValue]).join(' ');
    } else {
      return originalValue;
    }
  }

  ctrl.selectTemplate = () => {
    if (ctrl.metadataTemplate) {
      collections.getCollections().then(existingCollections => {
        const collection = ctrl.metadataTemplate.collectionFullPath.length > 0 ? verifyTemplateCollection(existingCollections, ctrl.metadataTemplate.collectionFullPath) : undefined;
        const metadata = applyTemplateToMetadata(ctrl.metadataTemplate.metadataFields);
        const usageRights = applyTemplateToUsageRights(ctrl.metadataTemplate.usageRights);

        ctrl.onMetadataTemplateSelected({metadata, usageRights, collection});
      });
    } else {
      ctrl.cancel();
    }
  };

  function verifyTemplateCollection(collectionNode, templateCollection) {
    if (templateCollection.every(node => collectionNode.data.fullPath.includes(node))) {
      return collectionNode;
    } else if (collectionNode.data.children.length > 0) {
      let i;
      let result = null;

      for (i = 0; result == null && i < collectionNode.data.children.length; i++) {
        result = verifyTemplateCollection(collectionNode.data.children[i], templateCollection);
      }
      return result;
    }
  }

  function applyTemplateToMetadata(templateMetadataFields) {
    if (templateMetadataFields && templateMetadataFields.length > 0) {
      ctrl.metadata = angular.copy(ctrl.originalMetadata);
      templateMetadataFields.forEach(field => {
        ctrl.metadata[field.name] = resolve(field.resolveStrategy, ctrl.metadata[field.name], field.value);
      });

      return ctrl.metadata;
    }
  }

  function applyTemplateToUsageRights(templateUsageRights) {
    if (templateUsageRights && templateUsageRights.hasOwnProperty('category')) {
      return templateUsageRights;
    } else {
      return ctrl.originalUsageRights;
    }
  }

  ctrl.cancel = () => {
    ctrl.metadataTemplate = null;
    ctrl.saving = false;
    ctrl.onMetadataTemplateCancelled({metadata: ctrl.originalMetadata, usageRights: ctrl.originalUsageRights});
  };

  ctrl.applyTemplate = () => {
    ctrl.saving = true;

    editsService
      .update(ctrl.image.data.userMetadata.data.metadata, ctrl.metadata, ctrl.image)
      .then(resource => ctrl.resource = resource)
      .then(() => {
        if (ctrl.metadataTemplate.collectionFullPath) {
          collections.addCollectionToImage(ctrl.image, ctrl.metadataTemplate.collectionFullPath);
        }
      })
      .then(() => {
        if (ctrl.metadataTemplate.usageRights) {
          editsService
            .update(ctrl.image.data.userMetadata.data.usageRights, ctrl.metadataTemplate.usageRights, ctrl.image)
            .then(() => editsService.updateMetadataFromUsageRights(ctrl.image, false));
        }
      })
      .finally(() => {
        ctrl.metadataTemplate = null;
        ctrl.saving = false;
        ctrl.onMetadataTemplateApplied();
      });
  };

  $scope.$watch('ctrl.originalMetadata', (originalMetadata) => {
    if (originalMetadata && ctrl.metadataTemplate) {
      ctrl.selectTemplate();
    }
  });
}]);

metadataTemplates.directive('grMetadataTemplates', [function() {
  return {
    restrict: 'E',
    controller: 'MetadataTemplatesCtrl',
    controllerAs: 'ctrl',
    bindToController: true,
    template: template,
    scope: {
      image: '=',
      originalMetadata: '=metadata',
      originalUsageRights: '=usageRights',
      onMetadataTemplateCancelled: '&?grOnMetadataTemplateCancelled',
      onMetadataTemplateApplied: '&?grOnMetadataTemplateApplied',
      onMetadataTemplateSelected: '&?grOnMetadataTemplateSelected'
    }
  };
}]);
