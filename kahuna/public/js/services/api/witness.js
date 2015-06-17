import angular from 'angular';

import '../api';

const mod = angular.module('kahuna.witness', [
    'kahuna.services.api'
]);

mod.factory('witnessApi', ['mediaApi', function(mediaApi) {

    const witnessPattern = /https:\/\/witness.theguardian.com\/assignment\/([0-9a-f]+)\/([0-9a-f]+)/;

    function isWitnessUri(uri) {
        return witnessPattern.test(uri);
    }

    function extractReportId(witnessUri) {
        const [all, assignmentId, reportId] = witnessUri.match(witnessPattern) || [];
        return reportId;
    }

    function parseReportResponse(response) {
        // FIXME: check moderation status

        const update = response.updates[0];
        const fileUri = update.image.extralarge;
        const metadata = {
            title:       response.headline,
            // FIXME: which fields?
            description: update.body,
            byline:      update.user.displayName,
            credit:      update.via
        };
        const witnessData = {
            // FIXME: use/save them?
            creditUri:   response.webUrl,
            apiUri:      response.apiUrl,
            noticeboard: response.noticeboard,
            report:      response.id.replace('report/')
        };

        return {fileUri, metadata, witnessData};
    }

    function getReport(id) {
        return mediaApi.root.
            follow('witness-report', {id}).
            get({}, {withCredentials: false}).
            then(parseReportResponse);
    }

    return {
        isWitnessUri,
        extractReportId,
        getReport
    };
}]);
