import angular from 'angular';
import {mediaApi} from './media-api';

export var witnessApi = angular.module('kahuna.services.api.witness', [
    mediaApi.name
]);

witnessApi.factory('witnessApi', ['mediaApi', function(mediaApi) {

    const witnessPattern =
        /https:\/\/witness.theguardian.com\/assignment\/([0-9a-f]+)\/([0-9a-f]+)/;

    function isWitnessUri(uri) {
        return witnessPattern.test(uri);
    }

    function extractReportUrlWord(witnessUri) {
        const [/*all*/, /*assignmentId*/, reportUrlWord] = witnessUri.match(witnessPattern) || [];
        return reportUrlWord;
    }

    function parseReportResponse(response) {
        // We have search for the contribution by urlWord rather than an id; hence this response is an array with our contribution expected as the first element.
        const contribution = response[0];

        const contributionId = contribution.id;

        // The full sized image can be obtained by making an auth'ed API call
        const mediaUsage = contribution.mediaUsages[0];
        const mediaUsageId = mediaUsage.id;

	    const contriblyAccessToken = "TODO - needs to be provided and stored in configuration rather than source";
        const fileUri = "https://api.contribly.com/1/contributions/" + contributionId + "/mediausages/" + mediaUsageId + "/artifacts/full.jpg?token=" + contriblyAccessToken;	// TODO push api url up to config

        const metadata = {
            title:       contribution.headline,
            description: contribution.body,
            byline:      contribution.via.user.displayName,		// TODO not null safe for anoynomous users
            credit:      'GuardianWitness',
            creditUri:   contribution.webUrl
        };
        const identifiers = {
            // FIXME: all of them?
            witnessReportUri:    contribution.apiUrl,
            witnessReportId:     contribution.id,
            witnessAssignmentId: contribution.assignment.id	// TODO potentially null in the future
        };

        return {fileUri, metadata, identifiers};
    }

    function getReport(urlWord) {
        return mediaApi.root.
            follow('witness-report', {urlWord}).
            // The API is not auth'd, and if withCredentials is true,
            // CORS fails because they don't support credentials in
            // their CORS headers.
            // TODO This refers to the legacy n0tice API; is it still relevant to the Contribly API?
            get({}, {withCredentials: false}).
            then(parseReportResponse);
    }

    return {
        isWitnessUri,
        extractReportId,
        getReport
    };
}]);
