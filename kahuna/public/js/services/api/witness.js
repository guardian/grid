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

    function getReport(id) {
        return mediaApi.root.follow('witness-report', {id}).get();
    }

    return {
        isWitnessUri,
        extractReportId,
        getReport
    };
}]);
