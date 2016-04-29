import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';

import '../../util/rx';

import {floor$, div$} from '../gu-lazy-table/observable-utils';

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
                return galleryWidth /(Math.min(currentItem + galleryOffset) * itemsCount);
        });

        return {
            newGalleryOffset$
        };
    };

    // Slider controls
    // ctrl.pos = 0;
    //
    // function setTransform() {
    //     ctrl.gallery.style.transform = 'translate3d(' + (-ctrl.pos * ctrl.gallery.offsetWidth) + 'px,0,0)';
    // }
    //
    // ctrl.previousItem = function() {
    //     ctrl.pos = Math.max(ctrl.pos - 1, 0);
    //     setTransform();
    // }
    //
    // ctrl.nextItem = function() {
    //     ctrl.pos = Math.min(ctrl.pos + 1, ctrl.itemCount - 1);
    //     setTransform();
    // }

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
            const gallery = element[0].children[0];
            const items$ = observeCollection$(scope, attrs.guLazyGallery);
            const galleryWidth$ = observe$(scope, gallry.clientWidth);

            const viewportResized$ = Rx.DOM.fromEvent($window, 'resize').
                debounce(100).
                startWith({/* init */});

            const offsetLeft$ = viewportResized$.map(() => {
                return gallery.style('translate3d') || 0;
            }).shareReplay(1);

            const {newGalleryOffset$} = ctrl.init({items$, offsetLeft$, galleryWidth$});

            console.log(gallery);

            subscribe$(scope, newGalleryOffset$, newGalleryOffset => {
                gallery.css({translate3d: newGalleryOffset + 'px'});
            });
        }
    };
}]);
