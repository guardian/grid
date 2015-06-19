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
        const update = response.updates[0];
        const fileUri = update.image.extralarge;
        const metadata = {
            title:       response.headline,
            description: update.body,
            byline:      response.user.displayName,
            credit:      'GuardianWitness'
        };
        const identifiers = {
            // FIXME: all of them?
            witnessReportUri:    response.apiUrl,
            witnessReportId:     response.id.replace('report/', ''),
            witnessAssignmentId: response.noticeboard
        };

        return {fileUri, metadata, identifiers};
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
