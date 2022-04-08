import angular from 'angular';
import template from './metadata-templates.html';

import '../util/rx';

import './metadata-templates.css';

import '../edits/service';

export const metadataTemplates = angular.module('kahuna.edits.metadataTemplates', [
  'kahuna.edits.service',
  'util.rx'
]);

metadataTemplates.controller('MetadataTemplatesCtrl', [
  '$scope',
  '$window',
  'editsService',
  function ($scope, $window, editsService) {

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
      const metadata = applyTemplateToMetadata();
      const usageRights = applyTemplateToUsageRights();

      ctrl.onMetadataTemplateSelected({metadata, usageRights});
    } else {
      ctrl.cancel();
    }
  };

  function applyTemplateToMetadata() {
    if (ctrl.metadataTemplate.metadataFields && ctrl.metadataTemplate.metadataFields.length > 0) {
      ctrl.metadata = angular.copy(ctrl.originalMetadata);
      ctrl.metadataTemplate.metadataFields.forEach(field => {
        ctrl.metadata[field.name] = resolve(field.resolveStrategy, ctrl.metadata[field.name], field.value);
      });

      return ctrl.metadata;
    }
  }

  function applyTemplateToUsageRights() {
    if (ctrl.metadataTemplate.usageRights && ctrl.metadataTemplate.usageRights.hasOwnProperty('category')) {
      return ctrl.metadataTemplate.usageRights;
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
