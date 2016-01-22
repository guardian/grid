import angular from 'angular';
import Rx from 'rx';

export const selectionTopBar = angular.module('gr.selectionTopBar', []);

selectionTopBar.controller('GrSelectionTopBarCtrl',
    ['$scope', '$q', 'inject$', 'selectedImages$', 'selection', 'panels',
    function($scope, $q, inject$, selectedImages$, selection, panels) {
        const ctrl = this;
        const selectionCount$ = selectedImages$.map(images => images.size);
        const active$ = selectionCount$.map(count => count > 0);


        ctrl.clearSelection = () => selection.clear();
        ctrl.metadataPanel = panels.metadataPanel;

        function canBeDeleted(image) {
            return image.getAction('delete').then(angular.isDefined);
        }
        // TODO: move to helper?
        const selectionIsDeletable$ = selectedImages$.flatMap(selectedImages => {
            const allDeletablePromise = $q.
            all(selectedImages.map(canBeDeleted).toArray()).
            then(allDeletable => allDeletable.every(v => v === true));
            return Rx.Observable.fromPromise(allDeletablePromise);
        });

        inject$($scope, selectedImages$, ctrl, 'selectedImages');
        inject$($scope, active$, ctrl, 'active');
        inject$($scope, selectionCount$, ctrl, 'selectionCount');
        inject$($scope, selectionIsDeletable$, ctrl, 'selectionIsDeletable');
    }]
);
