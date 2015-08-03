import angular from 'angular';
import 'angular-bootstrap';

import './gr-panel.css!';
import '../../services/preview-selection';
import '../../services/label';
import '../../services/archive';
import '../../edits/service';
import '../../image/service';
import '../../forms/gr-xeditable/gr-xeditable';
import ureTempalte from '../../usage-rights/usage-rights-editor.html!text';

export var grPanel = angular.module('grPanel', [
    'kahuna.services.selection',
    'kahuna.services.label',
    'kahuna.services.archive',
    'kahuna.edits.service',
    'gr.image.service',
    'grXeditable',
    'ui.bootstrap'
]);


grPanel.directive('grUsageRightsEditorr', function() {
    return {
        restrict: 'E',
        controller: 'grUsageRightsEditorCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: ureTempalte,
        scope: {
            service: '=grService'
        }
    }
});

grPanel.controller('grUsageRightsEditorCtrl', function() {

    var ctrl = this;

    ctrl.categories = [];
    ctrl.category = {};
    ctrl.model = {};

    ctrl.service.categories$.subscribe(cats => ctrl.categories = cats);
    ctrl.service.category$.subscribe(cat => ctrl.category = cat);
    ctrl.service.model$.subscribe(model => ctrl.model = model);

});


grPanel.controller('grArchiverCtrl', function() {

    var ctrl = this;
    ctrl.count = 0;
    ctrl.notArchivedCount = 0;
    ctrl.archivedCount = 0;

    ctrl.service.count$.subscribe(i => ctrl.count = i);
    ctrl.service.archivedCount$.subscribe(i => ctrl.archivedCount = i);
    ctrl.service.notArchivedCount$.subscribe(i => ctrl.notArchivedCount = i);

    ctrl.add = ctrl.service.add;
    ctrl.remove = ctrl.service.remove;
});

grPanel.directive('grArchiver', function() {
    return {
        restrict: 'E',
        controller: 'grArchiverCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            service: '=grService'
        },
        template: `
            {{ctrl.count}}
            <button ng:click="ctrl.add()" ng:if="ctrl.notArchivedCount !== 0">
                <gr-icon>star</gr-icon>
                archive
            </button>
            <span ng:if="ctrl.notArchivedCount !== 0 && ctrl.archivedCount !== 0">/</span>
            <button ng:click="ctrl.remove()" ng:if="ctrl.archivedCount !== 0">
                unarchive
                <gr-icon>star_border</gr-icon>
            </button>
        `
    };
});


grPanel.controller('grLabellerCtrl', ['$window', function($window) {
    var ctrl = this;

    ctrl.service.labels$.subscribe(labels => ctrl.labels = labels);

    ctrl.addLabel = () =>
        ctrl.service.add($window.prompt('Enter a label:') || '');

    ctrl.remove = label => ctrl.service.remove(label);
}]);

grPanel.directive('grLabeller', function() {
    return {
        restrict: 'E',
        controller: 'grLabellerCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            service: '=grService'
        },
        template: `
            Labels
            <ul class="labels">
                <li class="label" ng:repeat="label in ctrl.labels">
                    {{label}}
                    <button class="label__remove" ng:click="ctrl.remove(label)">
                        <gr-icon gr:small>close</gr-icon>
                    </button>
                </li>
            </ul>
            <button class="button-ico" ng:click="ctrl.addLabel()">
                <gr-icon>add</gr-icon>
            </button>`
    };
});


grPanel.controller('grMetadataEditorCtrl', function() {

    var ctrl = this;
    ctrl.model = {};
    ctrl.hasMultiples = {};

    ctrl.service.metadata$.subscribe(m => {
        Object.keys(m).forEach(field => {
            ctrl.hasMultiples[field] = m[field].length > 1;
            ctrl.model[field] = ctrl.hasMultiples[field] ? '' : m[field][0];
        });
    });

    ctrl.saveField = field => ctrl.service.saveField(field, ctrl.model[field]);

    // shitty ng:placeholder placeholder
    ctrl.placeholder = (field, placeholder) => ctrl.hasMultiples[field] ? placeholder : '';
    ctrl.disableSave = field => !ctrl.model[field] && ctrl.hasMultiples[field];

});

grPanel.directive('grMetadataEditor', function() {
    return {
        restrict: 'E',
        controller: 'grMetadataEditorCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            service: '=grService'
        },
        template: `
            <div>
                <div class="form-property">
                    <div class="form-label">Title</div>
                    <input type="text"
                        class="form-input-text"
                        placeholder="{{ctrl.placeholder('title', 'multiple titles')}}"
                        ng:model="ctrl.model.title" />

                    <button class="button-save"
                            ng:disabled="ctrl.disableSave('title')"
                            ng:click="ctrl.saveField('title')">
                        <gr-icon>check</gr-icon>
                    </button>
                </div>

                <div class="form-property">
                    <div class="form-label">Description</div>
                    <textarea
                        class="form-input-text"
                        placeholder="{{ctrl.placeholder('description', 'multiple descriptions')}}"
                        ng:model="ctrl.model.description"></textarea>

                    <button class="button-save"
                            ng:disabled="ctrl.disableSave('description')"
                            ng:click="ctrl.saveField('description')">
                        <gr-icon>check</gr-icon>
                    </button>
                </div>

                <div class="form-property">
                    <div class="form-label">Special instructions</div>
                    <textarea
                        class="form-input-text"
                        placeholder="{{ctrl.placeholder('specialInstructions', 'multiple special instructions')}}"
                        ng:model="ctrl.model.specialInstructions"></textarea>

                    <button class="button-save"
                            ng:disabled="ctrl.disableSave('specialInstructions')"
                            ng:click="ctrl.saveField('specialInstructions')">
                        <gr-icon>check</gr-icon>
                    </button>
                </div>

                <div class="form-property">
                    <div class="form-label">Byline</div>
                    <input type="text"
                        class="form-input-text"
                        placeholder="{{ctrl.placeholder('byline', 'multiple bylines')}}"
                        ng:model="ctrl.model.byline" />

                    <button class="button-save"
                            ng:disabled="ctrl.disableSave('byline')"
                            ng:click="ctrl.saveField('byline')">
                        <gr-icon>check</gr-icon>
                    </button>
                </div>

                <div class="form-property">
                    <div class="form-label">Credit</div>
                    <input type="text"
                        class="form-input-text"
                        placeholder="{{ctrl.placeholder('credit', 'multiple credits')}}"
                        ng:model="ctrl.model.credit" />

                    <button class="button-save"
                            ng:disabled="ctrl.disableSave('credit')"
                            ng:click="ctrl.saveField('credit')">
                        <gr-icon>check</gr-icon>
                    </button>
                </div>
            </div>`
    };
});

grPanel.controller('GrPanel', [
    '$rootScope',
    '$scope',
    '$window',
    '$q',
    'mediaApi',
    'selectionService',
    'labelService',
    'archiveService',
    'editsService',
    'archivedService',
    'metadataService',
    'labelsService',
    'usageRightsService',
    'onValChange',
    function (
        $rootScope,
        $scope,
        $window,
        $q,
        mediaApi,
        selection,
        labelService,
        archiveService,
        editsService,
        archivedService,
        metadataService,
        labelsService,
        usageRightsService,
        onValChange) {

        var ctrl = this;

        ctrl.selectedImages = selection.selectedImages;

        ctrl.hasMultipleValues = (val) => Array.isArray(val) && val.length > 1;
        ctrl.clear = selection.clear;


        ctrl.archivedService = archivedService(selection.images$);
        ctrl.metadataService = metadataService(selection.images$);
        ctrl.labelsService = labelsService(selection.images$);
        ctrl.usageRightsService = usageRightsService(selection.images$);

        selection.watchUpdates(
            ctrl.archivedService.updates$,
            ctrl.metadataService.updates$,
            ctrl.labelsService.updates$
        );


        ctrl.credits = function(searchText) {
            return ctrl.metadataSearch('credit', searchText);
        };

        ctrl.metadataSearch = (field, q) => {
            return mediaApi.metadataSearch(field,  { q }).then(resource => {
                return resource.data.map(d => d.key);
            });
        };

        $scope.$watch(() => selection.getMetadata(), onValChange(newMetadata => {
            ctrl.rawMetadata = newMetadata;
            ctrl.images = Array.from(ctrl.selectedImages);

            ctrl.metadata = selection.getDisplayMetadata();
            ctrl.usageRights = selection.getUsageRights();
            ctrl.selectedCosts = selection.getCost();
            ctrl.selectedLabels = selection.getLabels();
            ctrl.archivedCount = selection.getArchivedCount();

            selection.canUserEdit().then(editable => {
                ctrl.userCanEdit = editable;
            });

            editsApi.getUsageRightsCategories().then((cats) => {
                var categoryCode = ctrl.usageRights.reduce((m, o) => {
                    return (m == o.data.category) ? o.data.category : 'multiple categories';
                }, ctrl.usageRights[0] && ctrl.usageRights[0].data.category);

                var usageCategory = cats.find(cat => cat.value === categoryCode);
                ctrl.usageCategory = usageCategory ? usageCategory.name : categoryCode;
            });

            ctrl.showCosts = ctrl.selectedCosts.length === 1 ?
                ctrl.selectedCosts[0].data !== 'free' :
                ctrl.selectedCosts.length > 1;

            switch (ctrl.archivedCount) {
                case 0: {
                    ctrl.archivedState = 'unarchived';
                    break;
                }
                case ctrl.selectedImages.size: {
                    ctrl.archivedState = 'archived';
                    break;
                }
                default: {
                    ctrl.archivedState = 'mixed';
                    break;
                }
            }
        }));

        ctrl.updateMetadataField = function (field, value) {
            return editsService.batchUpdateMetadataField(ctrl.images, field, value);
        };

        ctrl.addLabel = function (label) {
            var imageArray = Array.from(ctrl.selectedImages);
            labelService.batchAdd(imageArray, [label]);
        };

        ctrl.removeLabel = function (label) {
            var imageArray = Array.from(ctrl.selectedImages);
            labelService.batchRemove(imageArray, label);
        };

        ctrl.newLabel = function () {
            var label = ($window.prompt('Enter a label:') || '').trim();

            if (label) {
                ctrl.addLabel(label);
            }
        };

        ctrl.archive = () => {
            ctrl.archiving = true;
            var imageArray = Array.from(ctrl.selectedImages);
            archiveService.batchArchive(imageArray)
                .then(() => {
                    ctrl.archiving = false;
                });
        };

        ctrl.unarchive = () => {
            ctrl.archiving = true;
            var imageArray = Array.from(ctrl.selectedImages);
            archiveService.batchUnarchive(imageArray)
                .then(() => {
                    ctrl.archiving = false;
                });
        };
    }
]);
