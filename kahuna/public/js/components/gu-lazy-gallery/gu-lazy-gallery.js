import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';

import elementResize from 'javascript-detect-element-resize';
let {addResizeListener, removeResizeListener} = elementResize;

import '../../util/rx';

import {combine$, floor$, div$} from '../gu-lazy-table/observable-utils';

export var lazyGallery = angular.module('gu.lazyGallery', ['util.rx']);

lazyGallery.controller('GuLazyGalleryCtrl', [function() {
    let ctrl = this;

    ctrl.init = function({items$, offsetLeft$, galleryWidth$}) {
        const itemsCount$ = items$.map(items => items.length).distinctUntilChanged();

        const currentItem$ = floor$(div$(offsetLeft$, galleryWidth$));

        const buttonCommands$ = Rx.Observable.create(observer => {
            ctrl.prevItem  = () => observer.onNext('prevItem');
            ctrl.nextItem  = () => observer.onNext('nextItem');
        });

        const galleryOffset$ = buttonCommands$.withLatestFrom(
            currentItem$,
            (command, currentItem) => {
                return {
                    prevItem: +1,
                    nextItem: -1
                }[command] || 0;
            });

        const newGalleryOffset$ = galleryOffset$.withLatestFrom(
            currentItem$, itemsCount$, galleryWidth$,
            (galleryOffset, currentItem, itemsCount, galleryWidth) => {
                const newItem = (currentItem + galleryOffset),
                      newGalleryOffset = newItem * galleryWidth;
                return newItem > 0 || newItem < -itemsCount ? 0 : newGalleryOffset;
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
            const gallery = element.find('#gallery');
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
                () => element[0].clientWidth
            ).shareReplay(1);

            const offsetLeft$ = new Rx.Subject();

            const {newGalleryOffset$} = ctrl.init({
                items$, offsetLeft$, galleryWidth$
            });

            scope.$watch(() => gallery.offset().left, (offset) => offsetLeft$.onNext(offset));

            subscribe$(scope, newGalleryOffset$, newGalleryOffset => {
                element.find('#gallery').css('transform', 'translate3d(' + newGalleryOffset + 'px, 0, 0)');
            });
        }
    };
}]);
