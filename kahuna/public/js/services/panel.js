import angular from 'angular';
import Rx from 'rx';


export const panelService = angular.module('kahuna.services.panel', []);

panelService.factory('panelService', [ '$rootScope', '$timeout', function () {
    const panels = new Map();

    function newPanel(panelName, { hidden = false, locked = false }) {
        const hiddenState$ = new Rx.Subject();
        const lockedState$ = new Rx.Subject();

        const change = (obs$, func) => obs$.onNext(func);

        const hidden$ = hiddenState$.startWith(() => hidden)
            .scan(() => hidden, (hidden, op) => op(hidden))
            .distinctUntilChanged()
            .shareReplay(1);

        const locked$ = lockedState$.startWith(() => locked)
            .scan(() => locked, (locked, op) => op(locked))
            .distinctUntilChanged()
            .shareReplay(1);

        const toggleHidden = () => change(hiddenState$, hidden => !hidden);
        const toggleLocked = () => change(lockedState$, locked => !locked);
        const setHidden = hidden => change(hiddenState$, () => hidden);
        const setLocked = locked => change(lockedState$, () => locked);

        const panel = {
            hidden$,
            locked$,
            toggleHidden,
            toggleLocked,
            setHidden,
            setLocked
        };

        panels.set(panelName, panel);
        return panel;
    }


    // Between these two methods we make sure we never return `null`.
    // If we ask for a panel that doesn't exist - we create it. If it is created
    // after that, we just set the given values.
    // Another solution would be to have them in a promise. e.g.
    // `getPanel(panelName).then(panel => { /* blah */ }), but what would the fail be?`
    function createPanel(panelName, { hidden = false, locked = false } = {}) {
        if (panels.get(panelName)) {
            const panel = panels.get(panelName);

            console.log('creating from old', hidden, locked, panelName)

            panel.setHidden(hidden);
            panel.setLocked(locked);

            return panels.get(panelName);
        } else {
            return newPanel(panelName, {hidden, locked});
        }
    }

    function getPanel(panelName) {
        const panel = panels.get(panelName);
        if (panel) {
            return panel;
        } else {
            console.log('getting from new', panelName)
            return newPanel(panelName, {});
        }
    }

    return {
        createPanel,
        getPanel
    };

}]);
