import apiServices from '../api';

apiServices.factory('loaderApi',
                    ['mediaApi',
                     function(mediaApi) {

    var loaderRoot;

    function getLoaderRoot() {
        if (! loaderRoot) {
            loaderRoot = mediaApi.root.follow('loader');
        }
        return loaderRoot;
    }

    function load(imageData) {
        var options = {
            // We could get the guessed mime-type from the File, but
            // it could be wrong, so might as well just send as data
            headers: {'Content-Type': 'application/octet-stream'},
            // Skip angular's default JSON-converting transform
            transformRequest: []
        };
        return getLoaderRoot().
            follow('load').post(imageData, options);
    }

    function import_(uri, identifiersMap = {}) {
        const identifiers = JSON.stringify(identifiersMap);
        return getLoaderRoot().
            follow('import', {uri, identifiers}).post();
    }

    return {
        load,
        import: import_
    };
}]);
