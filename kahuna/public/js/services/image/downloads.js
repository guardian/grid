import angular from 'angular';
import Immutable from 'immutable';
import Rx from 'rx';

import '../../imgops/service';

export const imageDownloadsService = angular.module(
    'gr.image-downloads.service', ['kahuna.imgops']);


imageDownloadsService.factory('imageDownloadsService', ['imgops', function(imgops) {
    function stripExtension(filename) {
        return filename.replace(/\.[a-zA-Z]{3,4}$/, '');
    }

    function imageName(imageData) {
        const filename = imageData.uploadInfo.filename;
        const imageId = imageData.id;

        if (filename) {
            const basename = stripExtension(filename);
            return `${basename} (${imageId}).jpg`;
        } else {
            return `${imageId}.jpg`;
        }
    }

    return {
        getDownloads: (imageResource) => {
            const image$ = Rx.Observable.fromPromise(imageResource.getData());

            const originalName$   = image$.map((image) => imageName(image))

            const secureUri$     = image$.map((image) => image.source.secureUrl)
            const lowRezUri$     = Rx.Observable.fromPromise(imgops.getLowResUri(imageResource))
            const fullScreenUri$ = Rx.Observable.fromPromise(imgops.getFullScreenUri(imageResource))

            return Rx.Observable.zip(originalName$, secureUri$, lowRezUri$, fullScreenUri$,
                    (originalName, secureUri, lowRezUri, fullScreenUri) => ({
                        filename: originalName,
                        uris: {secureUri, lowRezUri, fullScreenUri}
                    }));
        }
    };
}]);
