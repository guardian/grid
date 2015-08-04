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
    };

    var broadcastChange = (panelName, eventName) => $rootScope.$broadcast(
        'ui:panels:' + panelName + ':' + eventName
    );

    var panelAction = (panelName, action, proc, cancelable) => {
        const performProc = () => {
            if (panels[panelName]) {
                proc();
                broadcastChange(panelName, action);
            }
        };

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
    };

    var isVisible = (panelName) =>
        panels[panelName] ? panels[panelName].isVisible() : false;
    var isAvailable =  (panelName) =>
        panels[panelName] ? panels[panelName].isAvailable() : false;
    var isLocked =  (panelName) =>
        panels[panelName] ? panels[panelName].isLocked() : false;

    var setAvailable = (panelName, cancelable = true) =>
        panelAction(panelName, 'availability-updated', () =>
            panels[panelName].setAvailable(), cancelable);

    var setUnavailable = (panelName, cancelable = true) =>
        panelAction(panelName, 'availability-updated', () =>
            panels[panelName].setUnavailable(), cancelable);

    var setVisible = (panelName, cancelable = true) =>
        panelAction(panelName, 'visibility-updated', () =>
            panels[panelName].setVisible(), cancelable);

    var setInvisible = (panelName, cancelable = true) =>
        panelAction(panelName, 'visibility-updated', () =>
            panels[panelName].setInvisible(), cancelable);

    var setLocked = (panelName, cancelable = false) =>
        panelAction(panelName, 'lock-updated', () =>
            panels[panelName].setLocked(), cancelable);

    var setUnlocked = (panelName, cancelable = false) =>
        panelAction(panelName, 'lock-updated', () =>
            panels[panelName].setUnlocked(), cancelable);

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
