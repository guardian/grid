import angular from 'angular';
import Immutable from 'immutable';
import moment from 'moment';

import Rx from 'rx';

export const imageUsagesService = angular.module('gr.image-usages.service', [
  'kahuna.edits.service'
]);


imageUsagesService.factory('imageUsagesService', [function() {
  const recentDays = 7;

  function canDeleteUsages(image) {
    const actionName = 'delete-usages';
    return image.getAction(actionName).then(action => {
      if (action) {
        // return a function that performs the action
        return () => image.perform(actionName);
      }
    });
  }

  return {
    canDeleteUsages,
    getUsages: (imageResource) => {

      function frontsUsageTitle(usage) {
        const metadata = usage.get('frontUsageMetadata');
        return `${metadata.get('front')}, ${metadata.get('addedBy')}`;
      }

      function downloadUsageTitle(usage) {
        const metadata = usage.get('downloadUsageMetadata');
        return `${metadata.get('downloadedBy')}`;
      }

      function usageTitle(usage) {
        if (usage.has('frontUsageMetadata')) {
          return frontsUsageTitle(usage);
        } else if (usage.has('downloadUsageMetadata')) {
          return downloadUsageTitle(usage);
        }
        const referenceType =
          usage.get('platform') === 'print' ? 'indesign' : 'frontend';

        const reference = usage.get('references').find(u =>
          u.get('type') === referenceType);

        return (reference && reference.get('name')) ?
          reference.get('name') : 'No title found.';
      }

      const image$ = Rx.Observable.fromPromise(imageResource.getData());

      const usages$ = image$
        .flatMap((image) =>
          Rx.Observable.fromPromise(image.usages.getData()))
        .flatMap((usages) => usages.map(usage => usage.getData()))
        .flatMap(Rx.Observable.fromPromise)
        .toArray()
        .map((usages) =>
          Immutable.fromJS(usages).map(usage =>
            usage.set('title', usageTitle(usage))));

      const filterByPlatform = (platform) => usages$.map((usagesList) =>
        usagesList.filter(usage => usage.get('platform') === platform));

      const hasPlatformUsages = (platform) =>
        filterByPlatform(platform).every((group) => !group.isEmpty());

      const recentUsages$ = usages$.map((usagesList) => {
        return usagesList.filter(item=> {
          const timestamp = item.get('dateAdded');
          const recentIfAfter = moment().subtract(recentDays, 'days');
          return moment(timestamp).isAfter(recentIfAfter);
        });
      });


      const groupedByState$ = usages$
        .map((usagesList) => usagesList.groupBy(usage => usage.get('status')));

      const hasPrintUsages$ = hasPlatformUsages('print');
      const hasDigitalUsages$ = hasPlatformUsages('digital');
      const count$ = usages$.map((usages) => usages.size);

      return {
        usages$,
        groupedByState$,
        hasPrintUsages$,
        hasDigitalUsages$,
        count$,
        recentUsages$
      };
    },
    /*
     //If a usage is newer than this number of days,
      then consider it as "recent" and show a warning
     */
    recentTime: recentDays
  };

}]);
