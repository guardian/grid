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

    function extractReportId(witnessUri) {
        const [/*all*/, /*assignmentId*/, reportId] = witnessUri.match(witnessPattern) || [];
        return reportId;
    }

    function parseReportResponse(response) {
	const contributionId = response.id;

	// The full sized image can be obtained by making an auth'ed API call
	const mediaUsage = response.mediaUsages[0];
	const mediaUsageId = mediaUsage.id;

	const contriblyAccessToken = "TODO - needs to be provided and stored in configuration rather than source";
        const fileUri = "https://api.contribly.com/1/contributions/" + contributionId + "/mediausages/" + mediaUsageId + "/artifacts/full.jpg?token=" + contriblyAccessToken;	// TODO push api url up to config

        const metadata = {
            title:       response.headline,
            description: response.body,
            byline:      response.via.user.displayName,		// TODO not null safe for anoynomous users
            credit:      'GuardianWitness',
            creditUri:   response.webUrl
        };
        const identifiers = {
            // FIXME: all of them?
            witnessReportUri:    response.apiUrl,
            witnessReportId:     response.id,
            witnessAssignmentId: response.assignment.id	// TODO potentially null in the future
        };

        return {fileUri, metadata, identifiers};
    }

    function getReport(id) {
        return mediaApi.root.
            follow('witness-report', {id}).
            // The API is not auth'd, and if withCredentials is true,
            // CORS fails because they don't support credentials in
            // their CORS headers.
            get({}, {withCredentials: false}).
            then(parseReportResponse);
    }

    return {
        isWitnessUri,
        extractReportId,
        getReport
    };
}]);
