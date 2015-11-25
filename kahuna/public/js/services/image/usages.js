import angular from 'angular';
import Immutable from 'immutable';

export const imageUsagesService = angular.module('gr.image-usages.service', ['kahuna.edits.service']);

imageUsagesService.factory('imageUsagesService', [function() {

    function forImage(image) {
        function usageTitle(usage) {
            const referenceType = usage.get('usageType') == 'print' ? 'indesign' : 'frontend';

            const build = (usage, referenceType) => {
                const reference = usage.get('references').find(u =>
                    u.get('referenceType') == referenceType);

                return reference ? reference.get('name') : 'No title found.';
            };

            return build(usage, referenceType);
        }

        const usagesList = Immutable.fromJS(image.data.usages).map(u =>
            u.set('title', usageTitle(u)));

        const groupedByState = usagesList.groupBy(u => u.get('status'));

        const filterByUsageType = (usageType) =>
            usagesList.filter(u => u.get('usageType') == usageType);

        return {
            usages: usagesList.toJS(),
            groupedByState: groupedByState.toJS(),
            hasPrintUsages: !filterByUsageType('print').isEmpty(),
            hasWebUsages: !filterByUsageType('web').isEmpty()
        };
    }

    return image => forImage(image);
}]);
