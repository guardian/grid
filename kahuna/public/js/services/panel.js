import angular from 'angular';

export const panelService = angular.module('kahuna.services.panel', []);

panelService.factory('panelService', [ '$rootScope', '$timeout', function ($rootScope, $timeout) {

    class UIPanel {
        constructor(options) {
            this.name = options.name;
            this.initVisible = options.initVisible || false;
            this.initAvailable = options.initAvailable || false;
            this.initLocked = options.initLocked || false;

            this.visible = this.initVisible;
            this.available = this.initAvailable;
            this.locked = this.initLocked;
        }

        isAvailable() {
            return this.available;
        }

        isVisible() {
            return this.visible;
        }

        isLocked() {
            return this.locked;
        }

        setVisible() {
            if (!this.locked && this.available) {
                this.visible = true;
            }
        }

        setInvisible() {
            if (!this.locked && this.available) {
                this.visible = false;
            }
        }

        setAvailable() {
            this.available = true;
        }

        setUnavailable() {
            this.available = false;
        }

        setLocked() {
            this.locked = true;
        }

        setUnlocked() {
            this.locked = false;
        }
    }

    var panels = [];
    var actions = [];

    var addPanel = (panelName, initVisible) => {
        panels[panelName] = new UIPanel({ panelName, initVisible });

        broadcastChange(panelName, 'availability-updated');
        broadcastChange(panelName, 'visibility-updated');
    }

    var broadcastChange = (panelName, eventName) => $rootScope.$broadcast(
        'ui:panels:' + panelName + ':' + eventName
    );

    var panelAction = (panelName, action, proc, cancelable = true) => {
        const performProc = () => {
            if (panels[panelName]) {
                proc();
                broadcastChange(panelName, action);
            }
        }

        if (actions[panelName]) {
            $timeout.cancel(actions[panelName]);
        }

        if (cancelable) {
            actions[panelName] = $timeout(() => {
                performProc();
            }, 400);
        } else {
            performProc();
        }
    }

    var isVisible = (panelName) => panels[panelName] ? panels[panelName].isVisible() : false;
    var isAvailable =  (panelName) => panels[panelName] ? panels[panelName].isAvailable() : false;
    var isLocked =  (panelName) => panels[panelName] ? panels[panelName].isLocked() : false;

    var setAvailable = (panelName) =>
        panelAction(panelName, 'availability-updated', () => panels[panelName].setAvailable());

    var setUnavailable = (panelName) =>
        panelAction(panelName, 'availability-updated', () => panels[panelName].setUnavailable());

    var setVisible = (panelName) =>
        panelAction(panelName, 'visibility-updated', () => panels[panelName].setVisible());

    var setInvisible = (panelName) =>
        panelAction(panelName, 'visibility-updated', () => panels[panelName].setInvisible());

    var setLocked = (panelName) =>
        panelAction(panelName, 'lock-updated', () => panels[panelName].setLocked(), false);

    var setUnlocked = (panelName) =>
        panelAction(panelName, 'lock-updated', () => panels[panelName].setUnlocked(), false);

    var toggleLocked = (panelName) => {
        if (isLocked(panelName)) {
            setUnlocked(panelName);
        } else {
            setLocked(panelName);
        }
    };

    return {
        addPanel,
        isVisible,
        isAvailable,
        isLocked,
        setLocked,
        setUnlocked,
        toggleLocked,
        setAvailable,
        setUnavailable,
        setVisible,
        setInvisible
    };

}]);
