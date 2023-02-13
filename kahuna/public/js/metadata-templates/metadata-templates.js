import angular from 'angular';
import moment from 'moment';
import template from './metadata-templates.html';

import '../util/rx';

import './metadata-templates.css';

import '../edits/service';
import {collectionsApi} from '../services/api/collections-api';
import '../services/api/leases';

export const metadataTemplates = angular.module('kahuna.edits.metadataTemplates', [
  'kahuna.edits.service',
  collectionsApi.name,
  'util.rx'
]);

metadataTemplates.controller('MetadataTemplatesCtrl', [
  '$filter',
  '$scope',
  '$window',
  'editsService',
  'collections',
  'leaseService',
  function ($filter, $scope, $window, editsService, collections, leaseService) {

  let ctrl = this;

  ctrl.templateSelected = false;
  ctrl.metadataTemplates = window._clientConfig.metadataTemplates;

  const filterNonEmpty = (list) => list.filter(s => (typeof s === 'string' && s !== "" && s !== " "));

  function resolvePlaceholders(str) {
    const placeHolderValues = {
      uploadDate: $filter('date')(ctrl.image.data.uploadTime, 'd MMM yyyy'),
      uploadTime: $filter('date')(ctrl.image.data.uploadTime, 'd MMM yyyy, HH:mm'),
      uploadedBy: ctrl.image.data.uploadedBy
    };

    return str.replace(/{\s*(\w+?)\s*}/g, (_, key) => placeHolderValues[key]);
  }

  function resolve(strategy, originalValue, changeToApply) {
    let resolvedValue = originalValue;

    if (strategy === 'replace') {
      resolvedValue = changeToApply;
    } else if (strategy === 'append') {
      resolvedValue = filterNonEmpty([originalValue, changeToApply]).join(' ');
    } else if (strategy === 'prepend') {
      resolvedValue = filterNonEmpty([changeToApply, originalValue]).join(' ');
    }

    return resolvePlaceholders(resolvedValue);
  }

  function toLease(templateLease) {
    const lease = {
      createdAt: new Date(),
      access: templateLease.leaseType,
      notes: templateLease.notes ? resolvePlaceholders(templateLease.notes) : undefined
    };

    if (templateLease.durationInMillis !== undefined) {
      const leaseDuration = moment.duration(templateLease.durationInMillis);

      lease.startDate = new Date();
      lease.endDate = moment(lease.startDate).add(leaseDuration).toDate();
    }

    if (ctrl.access === 'allow-syndication') {
      lease.endDate = null;
    }

    if (lease.access === 'deny-syndication') {
      lease.startDate = null;
    }

    return lease;
  }

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
      const metadata = angular.copy(ctrl.originalMetadata);
      templateMetadataFields.forEach(field => {
        metadata[field.name] = resolve(field.resolveStrategy, metadata[field.name], field.value);
      });

      return metadata;
    }
  }

  function applyTemplateToUsageRights(templateUsageRights) {
    if (templateUsageRights && templateUsageRights.hasOwnProperty('category')) {
      return {
        ...templateUsageRights,
        creator: templateUsageRights.creator ? resolvePlaceholders(templateUsageRights.creator) : undefined,
        photographer: templateUsageRights.photographer ? resolvePlaceholders(templateUsageRights.photographer) : undefined,
        restrictions: templateUsageRights.restrictions ? resolvePlaceholders(templateUsageRights.restrictions) : undefined
      };
    } else {
      return ctrl.originalUsageRights;
    }
  }

  ctrl.selectTemplate = () => {
    if (ctrl.metadataTemplate) {
      collections.getCollections().then(existingCollections => {
        const collection = ctrl.metadataTemplate.collectionFullPath.length > 0 ? verifyTemplateCollection(existingCollections, ctrl.metadataTemplate.collectionFullPath) : undefined;
        const leases = ctrl.metadataTemplate.leases.map(templateLease => toLease(templateLease));
        const metadata = applyTemplateToMetadata(ctrl.metadataTemplate.metadataFields);
        const usageRights = applyTemplateToUsageRights(ctrl.metadataTemplate.usageRights);

        ctrl.onMetadataTemplateSelected({metadata, usageRights, collection, leases});
      });
    } else {
      ctrl.cancel();
    }
  };

  ctrl.cancel = () => {
    ctrl.metadataTemplate = null;
    ctrl.saving = false;
    ctrl.onMetadataTemplateCancelled({metadata: ctrl.originalMetadata, usageRights: ctrl.originalUsageRights});
  };

  ctrl.applyTemplate = () => {
    ctrl.saving = true;
    ctrl.onMetadataTemplateApplying({lease: ctrl.metadataTemplate.lease});

    let promise = Promise.resolve();

    promise.then(() => {
      if (ctrl.metadataTemplate.metadataFields.length > 0) {
        return editsService
          .update(ctrl.image.data.userMetadata.data.metadata, applyTemplateToMetadata(ctrl.metadataTemplate.metadataFields), ctrl.image);
      }
    })
    .then(() => {
      if (ctrl.metadataTemplate.collectionFullPath) {
        return collections.addCollectionToImage(ctrl.image, ctrl.metadataTemplate.collectionFullPath);
      }
    })
    .then(() => {
      if (ctrl.metadataTemplate.usageRights) {
        return editsService
          .update(ctrl.image.data.userMetadata.data.usageRights, applyTemplateToUsageRights(ctrl.metadataTemplate.usageRights), ctrl.image)
          .then(() => editsService.updateMetadataFromUsageRights(ctrl.image, false));
      }
    })
    .then(() => {
      if (ctrl.metadataTemplate.leases) {
        const leases = ctrl.metadataTemplate.leases.map(lease => toLease(lease));
        return leaseService.replace(ctrl.image, leases);
      }
    })
    .catch((e) => {
      console.error(e);
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
      onMetadataTemplateApplying: '&?grOnMetadataTemplateApplying',
      onMetadataTemplateApplied: '&?grOnMetadataTemplateApplied',
      onMetadataTemplateSelected: '&?grOnMetadataTemplateSelected'
    }
  };
}]);
