import angular from 'angular';

export const panelService = angular.module('kahuna.services.panel', []);

panelService.factory('panelService', [ '$rootScope', '$timeout', function ($rootScope, $timeout) {

    class UIPanel {
        constructor(options) {
            this.name = options.name;

            this.visible = options.initVisible || false;
            this.availability = options.initAvailable || false;
            this.locked = options.initLocked || false;
        }

        isAvailable() {
            return this.availability;
        }

        isVisible() {
            return this.visible && this.availability;
        }

        isLocked() {
            return this.visible && this.availability && this.locked;
        }

        show() {
            if (!this.locked && this.availability) {
                this.visible = true;
            }
        }

        hide() {
            if (!this.locked && this.availability) {
                this.visible = false;
            }
        }

        available() {
            this.availability = true;
        }

        unavailable() {
            this.availability = false;
        }

        lock() {
            if (this.visible && this.availability) {
                this.locked = true;
            }
        }

        unlock() {
            if (this.visible && this.availability) {
                this.locked = false;
            }
        }
    }

    var panels = [];
    var actions = [];

    var addPanel = (panelName, initVisible) => {
        panels[panelName] = new UIPanel({ panelName, initVisible });
        broadcastChange(panelName, 'updated');
    };

    var broadcastChange = (panelName, eventName) => $rootScope.$broadcast(
        'ui:panels:' + panelName + ':' + eventName
    );

    var panelAction = (panelName, proc, cancelable) => {
        const performProc = () => {
            if (panels[panelName]) {
                proc();
                broadcastChange(panelName, 'updated');
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

    var available = (panelName, cancelable = true) =>
        panelAction(panelName, () => panels[panelName].available(), cancelable);

    var unavailable = (panelName, cancelable = true) =>
        panelAction(panelName, () => panels[panelName].unavailable(), cancelable);

    var show = (panelName, cancelable = true) =>
        panelAction(panelName, () => panels[panelName].show(), cancelable);

    var hide = (panelName, cancelable = true) =>
        panelAction(panelName, () => panels[panelName].hide(), cancelable);

    var lock = (panelName, cancelable = false) =>
        panelAction(panelName, () => panels[panelName].lock(), cancelable);

    var unlock = (panelName, cancelable = false) =>
        panelAction(panelName, () => panels[panelName].unlock(), cancelable);

    var toggleLocked = (panelName) => isLocked(panelName) ?
        unlock(panelName) : lock(panelName);

    return {
        addPanel,
        isVisible,
        isAvailable,
        isLocked,
        lock,
        unlock,
        toggleLocked,
        available,
        unavailable,
        show,
        hide
    };

}]);
