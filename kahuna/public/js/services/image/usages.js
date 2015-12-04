import angular from 'angular';
import Immutable from 'immutable';

import Rx from 'rx';

export const imageUsagesService = angular.module('gr.image-usages.service', ['kahuna.edits.service']);


imageUsagesService.factory('imageUsagesService', [function() {

    function forImage(imageResource) {
        function usageTitle(usage) {
            const referenceType =
                usage.get('platform') == 'print' ? 'indesign' : 'frontend';

            const build = (usage, referenceType) => {
                const reference = usage.get('references').find(u =>
                    u.get('type') == referenceType);

                return reference.get('name') ? reference.get('name') : 'No title found.';
            };

            return build(usage, referenceType);
        }

        const image$ = Rx.Observable.fromPromise(imageResource.getData());
        const usages$ = image$
            .flatMap((image) =>
                Rx.Observable.fromPromise(image.usages.getData()))
            .flatMap((usages) => usages.map(usage => usage.getData()))
            .flatMap(Rx.Observable.fromPromise)
            .toArray()
            .map((usages) => {

                const usagesList =
                    Immutable.fromJS(usages).map(usage =>
                        usage.set('title', usageTitle(usage)));

                const groupedByState = usagesList.groupBy(usage =>
                    usage.get('status'));

                const filterByPlatform = (platform) =>
                    usagesList.filter(usage =>
                        usage.get('platform') == platform);

                return {
                    usages: usagesList.toJS(),
                    groupedByState: groupedByState.toJS(),
                    hasPrintUsages: !filterByPlatform('print').isEmpty(),
                    hasWebUsages: !filterByPlatform('digital').isEmpty()
                };

            });

        return usages$

    }

    return image => forImage(image);
}]);
