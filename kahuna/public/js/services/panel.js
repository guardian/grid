import angular from 'angular';
import Rx from 'rx';


export const panelService = angular.module('kahuna.services.panel', []);

panelService.factory('panelService', [function () {
    function mergeState(o, n) {
        // This is to avoid us getting into the state of (hidden && locked)
        // TODO: Error on a client asking for that state, given that we don't expose a method
        // to do that it's okay.
        const locked = n.hidden === true ? false :
            (angular.isDefined(n.locked) ? n.locked: o.locked);
        const hidden = n.locked === true ? false :
            (angular.isDefined(n.hidden) ? n.hidden : o.hidden);
        
        return {locked, hidden};
    }

    function newPanel(hidden = false, locked = false) {
        const startOp = () => ({hidden, locked});
        const stateSub$ = new Rx.Subject();

        const change = (obs$, func) => obs$.onNext(func);

        const state$ = stateSub$.startWith(startOp)
            .scan(startOp, (state, op) => op(state))
            .distinctUntilChanged()
            .shareReplay(1);

        const setHidden = hidden => change(stateSub$, state => mergeState(state, {hidden}));
        const setLocked = locked =>
            change(stateSub$, state => mergeState(state, {locked}));

        const toggleHidden = () => change(stateSub$, state  =>
            mergeState(state, {hidden:!state.hidden}));

        const toggleLocked = () => change(stateSub$, state  =>
            mergeState(state, {locked:!state.locked}));

        return {
            state$,
            toggleHidden,
            toggleLocked,
            setHidden,
            setLocked
        };
    }

    function createPanel(hidden = false, locked = false) {
        return newPanel(hidden, locked);
    }

    return {
        createPanel
    };

}]);
