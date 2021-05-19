import angular from 'angular';
import {List, Map} from 'immutable';

import {mediaApi} from '../../services/api/media-api';

export const querySuggestions = angular.module('querySuggestions', [
    mediaApi.name
]);

const fieldAliases = window._clientConfig.fieldAliases.
                                  filter(entry => entry.displaySearchHint === true).
                                  map(entry => entry.alias);

// FIXME: get fields and subjects from API
export const filterFields = [
    'by',
    'category',
    'city',
    'copyright',
    'country',
    'credit',
    'description',
    'fileType',
    'illustrator',
    'in',
    'keyword',
    'label',
    'location',
    'person',
    'source',
    'state',
    'subject',
    'supplier',
    'uploader',
    'usages@<added',
    'usages@>added',
    'usages@platform',
    'usages@status',
    'usages@reference',
    'has',
    'croppedBy',
    'filename',
    'photoshoot',
    'leasedBy',
    'is',
    ... fieldAliases
].sort();
// TODO: add date fields

const subjects = [
    'arts',
    'crime',
    'disaster',
    'finance',
    'education',
    'environment',
    'health',
    'human',
    'labour',
    'lifestyle',
    'nature',
    'news',
    'politics',
    'religion',
    'science',
    'social',
    'sport',
    'war',
    'weather'
];

const fileTypes = [
    'jpeg',
    'tiff',
    'png'
];

const staffPhotographerOrganisation = window._clientConfig.staffPhotographerOrganisation;

const isSearch = [
    `${staffPhotographerOrganisation}-owned-photo`,
    `${staffPhotographerOrganisation}-owned-illustration`,
    `${staffPhotographerOrganisation}-owned`,
  'under-quota'
];

querySuggestions.factory('querySuggestions', ['mediaApi', 'editsApi', function(mediaApi, editsApi) {

    function prefixFilter(prefix) {
        const lowerPrefix = prefix.toLowerCase();
        return (values) => values.filter(val => val.toLowerCase().startsWith(lowerPrefix));
    }

    function listSuppliers() {
        return editsApi.getUsageRightsCategories().
            then(results => {
                return new List(results).
                    filter(res => res.value === 'agency').
                    flatMap(res => res.properties).
                    filter(prop => prop.name === 'supplier').
                    flatMap(prop => prop.options).
                    toJS();
            });
    }

    function listCategories() {
        // TODO: would be nice to use user friendly labels and map
        // them to the key internally
        return editsApi.getUsageRightsCategories().
            then(results => {
                return results.
                    map(res => res.value).
                    filter(key => key !== ''); // no empty category
            });
    }

    const photographerCategories = List.of(
        'staff-photographer',
        'contract-photographer'
    );
    function listPhotographers() {
        return editsApi.getUsageRightsCategories().
            then(results => {
                return new List(results).
                    filter(res => photographerCategories.includes(res.value)).
                    flatMap(res => res.properties).
                    filter(prop => prop.name === 'photographer').
                    flatMap(prop => new Map(prop.optionsMap).valueSeq()).
                    flatMap(list => list).
                    sort().
                    toJS();
            });
    }

    function listIllustrators() {
        return editsApi.getUsageRightsCategories().
            then(results => {
                return new List(results).
                    filter(res => res.value === 'contract-illustrator').
                    flatMap(res => res.properties).
                    filter(prop => prop.name === 'creator').
                    flatMap(prop => prop.options).
                    toJS();
            });
    }

    function suggestCredit(prefix) {
        return mediaApi.metadataSearch('credit', {q: prefix}).
            then(results => results.data.map(res => res.key));
    }

    function suggestSource(prefix) {
        return mediaApi.metadataSearch('source', {q: prefix}).
            then(results => results.data.map(res => res.key));
    }

    function suggestLabels(prefix) {
        return mediaApi.labelsSuggest({q: prefix}).
            then(labels => labels.data);
    }

    function suggestPhotoshoot(prefix) {
        return mediaApi.metadataSearch('photoshoot', {q: prefix}).
        then(results => results.data.map(res => res.key));
    }

    function getFilterSuggestions(field, value) {
        switch (field) {
        case 'usages@status': return ['published', 'pending', 'removed'];
        case 'usages@platform': return ['print', 'digital'];
        case 'subject':  return prefixFilter(value)(subjects);
        case 'fileType': return prefixFilter(value)(fileTypes);
        case 'label':    return suggestLabels(value);
        case 'credit':   return suggestCredit(value);
        case 'source':   return suggestSource(value);
        case 'supplier': return listSuppliers().then(prefixFilter(value));
        // TODO: list all known bylines, not just our photographers
        case 'by':       return listPhotographers().then(prefixFilter(value));
        case 'illustrator': return listIllustrators().then(prefixFilter(value));
        case 'category': return listCategories().then(prefixFilter(value));
        case 'photoshoot': return suggestPhotoshoot(value);
        case 'is': return isSearch;
        // No suggestions
        default:         return [];
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
    }

    return {
        getChipSuggestions
    };
}]);
