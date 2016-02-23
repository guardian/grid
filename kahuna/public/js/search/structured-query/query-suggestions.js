import angular from 'angular';

import {mediaApi} from '../../services/api/media-api';

export const querySuggestions = angular.module('querySuggestions', [
    mediaApi.name
]);

// FIXME: get fields and subjects from API
export const filterFields = [
    'any',
    'by',
    'category',
    'city',
    'copyright',
    'country',
    'credit',
    'description',
    'in',
    'keyword',
    'label',
    'location',
    'state',
    'subject',
    'supplier',
    'uploader'
];
// TODO: add date fields

const subjects = [
    "arts",
    "crime",
    "disaster",
    "finance",
    "education",
    "environment",
    "health",
    "human",
    "labour",
    "lifestyle",
    "nature",
    "politics",
    "religion",
    "science",
    "social",
    "sport",
    "war",
    "weather"
];

querySuggestions.factory('querySuggestions', ['mediaApi', function(mediaApi) {

    function getFilterSuggestions(field, value) {
        switch (field) {
        case 'subject':
            return subjects;

        case 'label':
            return mediaApi.labelsSuggest({q: value}).
                then(labels => labels.data);

        case 'credit':
            return mediaApi.metadataSearch('credit', {q: value}).
                then(results => results.data.map(res => res.key));

        default:
            // No suggestions
            return [];
        }
    }

    function getChipSuggestions(chip) {
        if (chip.type === 'filter-chooser') {
            return filterFields.filter(f => f.startsWith(chip.value));
        } else if (chip.type === 'filter') {
            return getFilterSuggestions(chip.key, chip.value);
        } else {
            return [];
        }
    };

    return {
        getChipSuggestions
    };
}]);
