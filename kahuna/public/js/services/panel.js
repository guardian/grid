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

    let panels = [];
    let actions = [];

    const addPanel = (panelName, initVisible) => {
        panels[panelName] = new UIPanel({ panelName, initVisible });
        broadcastChange(panelName, 'updated');
    };

    const broadcastChange = (panelName, eventName) => $rootScope.$broadcast(
        'ui:panels:' + panelName + ':' + eventName
    );

    const panelAction = (panelName, proc, cancelable) => {
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

    const isVisible = (panelName) =>
        panels[panelName] ? panels[panelName].isVisible() : false;
    const isAvailable =  (panelName) =>
        panels[panelName] ? panels[panelName].isAvailable() : false;
    const isLocked =  (panelName) =>
        panels[panelName] ? panels[panelName].isLocked() : false;

    const available = (panelName, cancelable = true) =>
        panelAction(panelName, () => panels[panelName].available(), cancelable);

    const unavailable = (panelName, cancelable = true) =>
        panelAction(panelName, () => panels[panelName].unavailable(), cancelable);

    const show = (panelName, cancelable = true) =>
        panelAction(panelName, () => panels[panelName].show(), cancelable);

    const hide = (panelName, cancelable = true) =>
        panelAction(panelName, () => panels[panelName].hide(), cancelable);

    const lock = (panelName, cancelable = false) =>
        panelAction(panelName, () => panels[panelName].lock(), cancelable);

    const unlock = (panelName, cancelable = false) =>
        panelAction(panelName, () => panels[panelName].unlock(), cancelable);

    const toggleLocked = (panelName) => isLocked(panelName) ?
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
