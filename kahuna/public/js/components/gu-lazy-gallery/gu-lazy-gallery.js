import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';

import template from './gu-lazy-gallery.html!text';

import '../../util/rx';

export var lazyGallery = angular.module('gu.lazyGallery', ['util.rx']);

lazyGallery.controller('GuLazyGalleryCtrl', [function() {
    let ctrl = this;

    ctrl.init = (items$) => {
        const itemsCount$ = items$.map(items => items.length).distinctUntilChanged();

        const currentItem$ = items$.filter(item => item.data.id === ctrl.item.data.id);

        const buttonCommands$ = Rx.Observable.create(observer => {
            ctrl.prevItem       = () => observer.onNext('prevItem');
            ctrl.nextItem       = () => observer.onNext('nextItem');
            ctrl.galleryStart   = () => observer.onNext('start');
            ctrl.galleryEnd     = () => observer.onNext('end');
        });

        const itemsOffset$ = buttonCommands$.withLatestFrom(
            itemsCount$,
            (command, itemsCount) => {
                return {
                    prevItem:  - 1,
                    nextItem:  + 1,
                    start: 0,
                    end: + itemsCount,
                }[command] || 0;
            });

        const itemIndex$ = itemsOffset$.withLatestFrom(
            items$,
            (itemsOffset, items) => {
                console.log(itemsOffset);
                return items[itemsOffset];
        });

        return {itemIndex$};
    };

}]);

lazyGallery.directive('guLazyGallery', ['observe$', 'observeCollection$', 'subscribe$', '$window',
                                        function(
                                            observe$, observeCollection$, subscribe$, $window) {
    return {
        restrict: 'E',
        controller: 'GuLazyGalleryCtrl',
        controllerAs: 'galleryCtrl',
        transclude: true,
        template: template,
        link: function(scope, element, attrs, ctrl) {
            // Map attributes as Observable streams
            const {
                guLazyGalleryItems:            itemsAttr,
                guLazyGallerySelectionMode:    selectionMode,
            } = attrs;

            const items$         = observeCollection$(scope, itemsAttr);
            const selectionMode$ = observe$(scope, selectionMode);

            const {currentItem$} = ctrl.init(items$);

            subscribe$(scope, selectionMode$, selectionMode => {
                ctrl.selectionMode = selectionMode;
            });

            // subscribe$(scope, currentItem$, currentItem => {
            //     ctrl.item = currentItem;
            // });
        }
    };
}]);
