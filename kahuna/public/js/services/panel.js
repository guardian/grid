import angular from 'angular';

export const panelService = angular.module('kahuna.services.panel', []);

panelService.factory('panelService', [ '$rootScope', function($rootScope) {

    class UIPanel {
        constructor(options) {
            this.name = options.name;
            this.initVisible = options.initVisible || false;
            this.hidden = this.initVisible;
        }

        isVisible() {
            return this.hidden;
        }

        toggleVisibility() {
            this.hidden = !this.hidden
        }
    }

    var panels = [];

    var isVisible = (panelName) => panels[panelName].isVisible();

    var addPanel = (panelName, initVisible) => panels[panelName] =
        new UIPanel({ panelName, initVisible });

    var togglePanel = (panelName) => {
        panels[panelName].toggleVisibility();

        $rootScope.$broadcast(
            'ui:panels:' + panelName + ':visibility-updated',
            panels[panelName].isVisible()
        );
    }

    return {
        isVisible,
        addPanel,
        togglePanel
    }

}]);
