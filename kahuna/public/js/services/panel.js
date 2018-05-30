import angular from 'angular';
import Rx from 'rx';
import '../util/storage';


export const panelService = angular.module('kahuna.services.panel', ['util.storage']);

panelService.factory('panelService', ['storage', function (storage) {
    function mergeState(o, n) {
        // This is to avoid us getting into the state of (hidden && locked)
        // TODO: Error on a client asking for that state, given that we don't expose a method
        // to do that it's okay.
        const locked = n.hidden === true ? false :
            (angular.isDefined(n.locked) ? n.locked : o.locked);
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

    // This is decoupled from the actual panels as we need the scope, which can be different in
    // different contexts. You also might not want to have the state saved.
    function setAndSaveState($scope, name, panel) {
        const storeName = `${name}PanelState`;
        const state = storage.getJs(storeName) || {locked: false, hidden: true};
        const sub = panel.state$.subscribe(state => storage.setJs(storeName, state));

        panel.setHidden(state.hidden);
        panel.setLocked(state.locked);

        $scope.$on('$destroy', () => sub.dispose());
    }

    return {
        createPanel,
        setAndSaveState
    };

}]);
