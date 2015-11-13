import angular from 'angular';
import Immutable from 'immutable';
import {List} from 'immutable';

import '../edits/service';

export const imageService = angular.module('gr.image.service', ['kahuna.edits.service']);

imageService.factory('imageService', [function() {
    function forImage(image) {
        return {
            usageRights: usageRights(image),
            usages: usages(image),
            states: getStates(image)
        };
    }

    function usageRights(image) {
        return {
            image: image,
            data: image.data.usageRights
        };
    }

    function usages(image) {
        function usageTitle(usage) {
            const sourceType = usage.get("usageType") == "print" ? "indesign" : "frontend";

            const build = (usage, sourceType) => {
                const source = usage.get("source").find(u => u.get("usageType") == sourceType)
                return source ? source.get("name") : "No title found."
            }

            return build(usage, sourceType);
        }

        const usagesList = Immutable.fromJS(image.data.usages).map(u => u.set("title", usageTitle(u)));
        const groupedByState = usagesList.groupBy(u => u.get("status"));
        const filterByUsageType = (usageType) => usagesList.filter(u => u.get("usageType") == usageType)

        return {
            usages: usagesList.toJS(),
            groupedByState: groupedByState.toJS(),
            hasPrintUsages: !filterByUsageType("print").isEmpty(),
            hasWebUsages: !filterByUsageType("web").isEmpty()
        };
    }

    function getStates(image) {
        const persistReasons = image.data.persisted.reasons.map(reason => {
            switch (reason) {
                case 'exports':
                    return 'cropped';
                case 'persistence-identifier':
                    return 'from Picdar';
                case 'photographer-category':
                    return 'categorised as photographer';
                case 'illustrator-category':
                    return 'categorised as illustrator';
                default:
                    return reason;
            }
        });

        return {
            cost: image.data.cost,
            hasCrops: image.data.exports && image.data.exports.length > 0,
            isValid: image.data.valid,
            canDelete: image.getAction('delete').then(action => !! action),
            canArchive: image.data.persisted.value === false ||
                (persistReasons.length === 1 && persistReasons[0] === 'archived'),
            persistedReasons: persistReasons.join('; ')
        };
    }

    return image => forImage(image);
}]);
