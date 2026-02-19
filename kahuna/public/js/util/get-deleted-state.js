import angular from 'angular';

export const getDeletedState = angular.module('util.getDeletedState',
  ['kahuna.services.api.media']);

getDeletedState.factory('getDeletedState',
  ['mediaApi',

  function(mediaApi) {
    return function(ctrl) {
      mediaApi.getSession().then(session => {
        const isSoftDeleted = ctrl.image?.data?.softDeletedMetadata !== undefined;
        const userCanDeleteAnything = session.user.permissions.canDelete;
        const userUploadedThisImage = session.user.email === ctrl.image?.data?.uploadedBy;
        const thisImageWasReaped = ctrl.image?.data?.softDeletedMetadata?.deletedBy === 'reaper';

        if (isSoftDeleted) {
          ctrl.isDeleted = true;

          if (userCanDeleteAnything || userUploadedThisImage || thisImageWasReaped) {
            ctrl.canUndelete = true;
          }
        }
      });
    };

  }]);
