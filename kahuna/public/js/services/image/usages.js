import angular from 'angular';
import Immutable from 'immutable';

import Rx from 'rx';

export const imageUsagesService = angular.module('gr.image-usages.service', [
        'kahuna.edits.service'
]);


imageUsagesService.factory('imageUsagesService', [function() {

    return {
        getUsages: (imageResource) => {

            function usageTitle(usage) {
                const referenceType =
                    usage.get('platform') == 'print' ? 'indesign' : 'frontend';

                const reference = usage.get('references').find(u =>
                        u.get('type') == referenceType);

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
                usagesList.filter(usage => usage.get('platform') == platform));

            const hasPlatformUsages = (platform) =>
                filterByPlatform(platform).every((group) => !group.isEmpty());

            const usageListAfter$ = (since) => usages$.map((usagesList) => {
                    const nowtime = new Date();
                    return usagesList.filter((usage) => {
                        // console.log("evaluating for " + usage);
                        // console.log("dateAdded is " + usage.get('dateAdded'));
                        // console.log("value is " + moment(usage.get('dateAdded')).isAfter(moment(nowtime).subtract(since, 'days')));
                        return moment(usage.dateAdded).isAfter(moment(nowtime).subtract(since, 'days'));
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
                usageListAfter$
            };
        },
        /*
         //If a usage is newer than this number of days,
          then consider it as "recent" and show a warning
         */
        recentTime: 7
    };

}]);
