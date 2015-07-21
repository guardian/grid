import angular from 'angular';

import './usage-rights-editor.js';

export var batch = angular.module('kahuna.edits.batchUsageRightsEditor', [
    'kahuna.edits.usageRightsEditor'
]);

batch.controller('BatchUsageRightsEditor', [function() {

    var ctrl = this;

    ctrl.cleanUsageRights = () => {
        // find the diff if there is one
    };

    ctrl.isDiffyCollection = () => {
        // Are we messy?
    };

    ctrl.applyToAll = (data) => {
        // Do as the name states
    };

}]);

batch.directive('grBatchUsageRightsEditor', [function() {
    return {
        restrict: 'E',
        controller: 'BatchUsageRightsEditor',
        controllerAs: 'ctrl',
        bindToController: true,
        template: `
            <div ng:switch="ctrl.isDiffyCollection()"
                <div ng:switch-when="true">
                    Multiple usage rights
                    <button>edit</button>
                </div>

                <div ng:switch-when="false">
                    <gr:usage-rights
                        gr:usage-rights="ctrl.cleanUsageRights()"
                        gr:on-save="ctrl.applyToAll($data)">
                    </gr:usage-rights>
                </div>
            </div>`,
        scope: {
            usageRightsCollection: '=grUsageRightsCollection'
        }
    };
}]);
