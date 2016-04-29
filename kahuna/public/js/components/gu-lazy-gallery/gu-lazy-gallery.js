import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';

import '../../util/rx';

import {combine$, floor$, div$} from '../gu-lazy-table/observable-utils';

export var lazyGallery = angular.module('gu.lazyGallery', ['util.rx']);

lazyGallery.controller('GuLazyGalleryCtrl', [function() {
    let ctrl = this;

    ctrl.init = function({items$, offsetLeft$, galleryWidth$}) {
        const itemsCount$ = items$.map(items => items.length).distinctUntilChanged();

        const currentItem$ = floor$(div$(offsetLeft$, itemsCount$));

        const buttonCommands$ = Rx.Observable.create(observer => {
            ctrl.prevItem  = () => observer.onNext('prevItem');
            ctrl.nextItem  = () => observer.onNext('nextItem');
        });

        const galleryOffset$ = buttonCommands$.withLatestFrom(
            (command) => {
                return {
                    prevItem:  - 1,
                    nextItem:  + 1
                }[command] || 0;
            });

        const newGalleryOffset$ = galleryOffset$.withLatestFrom(
            currentItem$, itemsCount$, galleryWidth$,
            (galleryOffset, currentItem, itemsCount, galleryWidth) => {
                return (currentItem + galleryOffset) * galleryWidth;
        });

        return {
            newGalleryOffset$
        };
    };
}]);

lazyGallery.directive('guLazyGallery', ['observe$', 'observeCollection$', 'subscribe$', '$window',
                                        function(
                                            observe$, observeCollection$, subscribe$, $window) {
    return {
        restrict: 'A',
        controller: 'GuLazyGalleryCtrl',
        controllerAs: 'galleryCtrl',
        transclude: true,
        template: `
            <ng-transclude></ng-transclude>
            <div class="gallery__controls">
                <button class="gallery__control gallery__control--left"
                        ng:class="{ 'gallery__control--disabled': galleryCtrl.pos === 0 }"
                        ng:disabled="galleryCtrl.pos === 0"
                        ng:click="galleryCtrl.previousItem()">
                    <gr-icon-label gr-icon="keyboard_arrow_left">Previous</gr-icon-label>
                </button>

                <button class="gallery__control gallery__control--right"
                        ng:class="{ 'gallery__control--disabled': galleryCtrl.pos === galleryCtrl.galleryLength - 1 }"
                        ng:disabled="galleryCtrl.pos === galleryCtrl.galleryLength - 1"
                        ng:click="galleryCtrl.nextItem()">
                    <gr-icon-label gr-icon="keyboard_arrow_right">Next</gr-icon-label>
                </button>
            </div>`,
        link: function(scope, element, attrs, ctrl) {
            const gallery = element[0].children[0].children[0]; // Gross, I know
            const items$ = observeCollection$(scope, attrs.guLazyGallery);

            const viewportResized$ = Rx.DOM.fromEvent($window, 'resize').
                debounce(100).
                startWith({/* init */});

            // Element resized (possibly not the viewport, e.g. side-panel expanded)
            const elementResized$ = Rx.Observable.fromEventPattern(
                handler => addResizeListener(element[0], handler),
                handler => removeResizeListener(element[0], handler)
            ).startWith({/* init */});

            const galleryWidth$ = combine$(
                viewportResized$,
                elementResized$,
                () => gallery.clientWidth
            ).shareReplay(1);

            const offsetLeft$ = viewportResized$.map(() => {
                return 1 || 0;
            }).shareReplay(1);

            const {newGalleryOffset$} = ctrl.init({
                items$, offsetLeft$, galleryWidth$
            });

            subscribe$(scope, newGalleryOffset$, newGalleryOffset => {
                console.log(newGalleryOffset);
                gallery.css({translate3d: newGalleryOffset + 'px'});
            });
        }
    };
}]);
