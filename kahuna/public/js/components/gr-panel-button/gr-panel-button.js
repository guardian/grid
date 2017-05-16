import angular from 'angular';
import template from './gr-panel-button.html!text';
import templateSmall from './gr-panel-button-small.html!text';
import '../../util/rx';

export const panelButton = angular.module('gr.panelButton', ['util.rx']);

panelButton.controller('GrPanelButton', ['$scope', 'inject$', function($scope, inject$) {
    const ctrl = this;
    const panels = ctrl.panel.isArray ? ctrl.panel : [ctrl.panel];
    const panel = panels[0];

    //TODO: Pay attention to multiple panels
    ctrl.trackingName = 'Panel Button';
    ctrl.trackingData = action => ({
        'Panel name': ctrl.name,
        'Action': action
    });
    ctrl.showPanel   = () => panel.setHidden(false);
    ctrl.lockPanel   = () => panel.setLocked(true);
    ctrl.unlockPanel = () => panel.setLocked(false);
    ctrl.hidePanel   = () => {
        panel.setLocked(false);
        panel.setHidden(true);
    };

    ctrl.toolTipPosition = () => {
        switch (ctrl.position) {
        case 'right':
            return 'left';
        case 'left':
            return 'right';
        default:
            return 'bottom';
        }
    };

    inject$($scope, panel.state$, ctrl, 'state');
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
            name: '@grName',
            icon: '@grIcon'
        }
    };
}]);

panelButton.directive('grPanelButtonSmall', [function() {
    return {
        restrict: 'E',
        template: templateSmall,
        bindToController: true,
        controller: 'GrPanelButton',
        controllerAs: 'ctrl',
        scope: {
            panel: '=grPanel',
            position: '@grPosition',
            name: '@grName',
            icon: '@grIcon'
        }
    };
}]);
