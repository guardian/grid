import angular from 'angular';
import JSZip from 'jszip';
import Rx from 'rx';

import '../../imgops/service';

export const imageDownloadsService = angular.module(
    'gr.image-downloads.service', ['kahuna.imgops']);


imageDownloadsService.factory('imageDownloadsService', ['imgops', '$http', function(imgops, $http) {
    function stripExtension(filename) {
        return filename.replace(/\.[a-zA-Z]{3,4}$/, '');
    }

    function imageName(imageData) {
        const filename = imageData.uploadInfo.filename;
        const imageId = imageData.id;
        const extension = imageData.source.mimeType === 'image/jpeg' ? 'jpg' : 'png';

        if (filename) {
            const basename = stripExtension(filename);
            return `${basename} (${imageId}).` + extension;
        } else {
            return `${imageId}.jpg` + extension;
        }
    }

    function getDownloads(imageResource) {
        const image$ = Rx.Observable.fromPromise(imageResource.getData());

        const originalName$   = image$.map((image) => imageName(image));

        const secureUri$     = image$.map((image) => image.source.secureUrl);
        const lowRezUri$     = Rx.Observable.fromPromise(imgops.getLowResUri(imageResource));
        const fullScreenUri$ = Rx.Observable.fromPromise(imgops.getFullScreenUri(imageResource));

        return Rx.Observable.zip(originalName$, secureUri$, lowRezUri$, fullScreenUri$,
                (originalName, secureUri, lowRezUri, fullScreenUri) => ({
                    filename: originalName,
                    uris: {secureUri, lowRezUri, fullScreenUri}
                }));
    }

    function download$(imageResources, downloadKey) {
        const downloadObservables = imageResources
            .map((image) => getDownloads(image));

        const downloads$ = Rx.Observable.merge(downloadObservables);

        const zip = new JSZip();
        const imageHttp = url => $http.get(url, { responseType:'arraybuffer' });

        const addDownloadsToZip$ = downloads$
            .flatMap((downloads) => Rx.Observable
                    .fromPromise(imageHttp(downloads.uris[downloadKey]))
                    .map((resp) => zip.file(downloads.filename, resp.data))
            ).toArray().map(() => zip);

        return addDownloadsToZip$;
    }

    return {
        download$,
        getDownloads
    };
}]);
