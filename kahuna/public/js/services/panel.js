import angular from 'angular';
import Rx from 'rx';


export const panelService = angular.module('kahuna.services.panel', []);

panelService.factory('panelService', ['$timeout', function ($timeout) {
    const panels$ = new Rx.ReplaySubject();

    function newPanel({ hidden = false, locked = false }) {
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

        return {
            hidden$,
            locked$,
            toggleHidden,
            toggleLocked,
            setHidden,
            setLocked
        };
    }

    function createPanel(panelName, { hidden = false, locked = false } = {}) {
        const panel = newPanel({hidden, locked});
        panels$.onNext({ name: panelName, panel });
        return panel;
    }

    function getPanel$(panelName) {
        return panels$.find(p => p.name === panelName).map(p => p.panel);
    }

    return {
        createPanel,
        getPanel$
    };

}]);
