import angular from 'angular';

export const panelService = angular.module('kahuna.services.panel', []);

panelService.factory('panelService', [ '$rootScope', function($rootScope) {

    class UIPanel {
        constructor(options) {
            this.name = options.name;
            this.initVisible = options.initVisible || false;
            this.initAvailable = options.initAvailable || false;

            this.hidden = this.initVisible;
            this.available = this.initAvailable;
        }

        isAvailable() {
            return this.available;
        }

        isVisible() {
            return this.hidden;
        }

        toggleVisibility() {
            this.hidden = !this.hidden
        }

        setAvailable() {
            this.available = true;
        }

        setUnavailable() {
            this.available = false;
        }
    }

    var panels = [];

    var addPanel = (panelName, initVisible) => {
        panels[panelName] = new UIPanel({ panelName, initVisible });

        broadcastChange(panelName, 'availability-updated');
        broadcastChange(panelName, 'visibility-updated');
    }

    var broadcastChange = (panelName, eventName) => $rootScope.$broadcast(
        'ui:panels:' + panelName + ':' + eventName
    );

    var isVisible = (panelName) => panels[panelName] ? panels[panelName].isVisible() : false;
    var isAvailable =  (panelName) => panels[panelName] ? panels[panelName].isAvailable() : false;

    var setAvailable = (panelName) => {
        panels[panelName].setAvailable();
        broadcastChange(panelName, 'availability-updated');
    }

    var setUnavailable = (panelName) => {
        panels[panelName].setUnavailable();
        broadcastChange(panelName, 'availability-updated');
    }

    var togglePanel = (panelName) => {
        panels[panelName].toggleVisibility();
        broadcastChange(panelName, 'visibility-updated');
    }

    return {
        addPanel,
        isVisible,
        isAvailable,
        setAvailable,
        setUnavailable,
        togglePanel
    }

}]);
