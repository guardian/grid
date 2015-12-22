import angular from 'angular';
import template from './gr-panel-button.html!text';
import '../../util/rx';

export const panelButton = angular.module('gr.panelButton', ['util.rx']);

panelButton.controller('GrPanelButton', ['$scope', 'inject$', function($scope, inject$) {
    const ctrl = this;
    const panel = ctrl.panel;

    ctrl.showPanel   = () => panel.setHidden(false);
    ctrl.lockPanel   = () => panel.setLocked(true);
    ctrl.unlockPanel = () => panel.setLocked(false);
    ctrl.hidePanel   = () => {
        panel.setLocked(false);
        panel.setHidden(true);
    };

    // TODO: Could we have a helper to watch multiple streams?
    inject$($scope, panel.hidden$, ctrl, 'hidden');
    inject$($scope, panel.locked$, ctrl, 'locked');
}]);

panelButton.directive('grPanelButton', [function() {
    return {
        restrict: 'E',
        template: template,
        bindToController: true,
        controller: 'GrPanelButton',
        controllerAs: 'ctrl',
        scope: {
            panel: '=grPanel',
            position: '@grPosition',
            name: '@grName'
        }
    };
}]);
