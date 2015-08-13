import angular from 'angular';
import Rx from 'rx';

export const archiverService = angular.module('gr.archiver.service', []);

archiverService.factory('archiverService', ['$q', function($q) {

    function getArchived(image) {
        return image.data.userMetadata.data.archived;
    }

    function archivedService(images$) {
        const count$ = images$.map(images => images.length);
        const updates$ = new Rx.Subject();

        const archivedCount$ = images$.map(images => images.filter(image =>
            getArchived(image).data === true
        ).length);

        const notArchivedCount$ = images$.map(images => images.filter(image =>
            getArchived(image).data === false
        ).length);

        const hasMixed$ =
            archivedCount$.combineLatest(notArchivedCount$, (archived, notArchived) =>
                archived !== 0 && notArchived !== 0
            );

        return {
            archive, unarchive,
            updated$, count$, archivedCount$, notArchivedCount$, hasMixed$ };

        function archive() {
            return save(true);
        }

        function unarchive() {
            return save(false);
        }

        function save(val) {
            const edits = images$.getValue().map(image =>
                getArchived(image).
                    put({ data: val }).
                    then(archived => {
                        image.data.userMetadata.data.archived = archived;
                        return image;
                    })
            );

            return $q.all(edits).then(images => updates$.onNext(images));
        }

        function updated$(func) {
            func(updates$);
        }
    }

    return archivedService;
}]);
