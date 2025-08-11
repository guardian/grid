import angular from 'angular';
import {mediaApi} from './media-api';

export var editsApi = angular.module('kahuna.services.api.edits', [
    mediaApi.name
]);

/**
 * @typedef {{
 *   value: string;
 *   name: string;
 *   cost: string;
 *   description: string;
 *   defaultRestrictions?: string;
 *   caution?: string;
 *   properties: UsageRightsProperty[];
 *   leases: UsageRightsLease[];
 *   usageRestrictions?: string;
 *   usageSpecialInstructions?: string;
 * }} CategoryResponse
 */

/**
 * @typedef {{
 *   name: string;
 *   label: string;
 *   type: string;
 *   required: Boolean;
 *   options?: string[];
 *   optionsMap?: Record<string, string[]>;
 *   optionsMapKey?: string;
 *   examples?: string;
 * }} UsageRightsProperty
 */

/**
 * @typedef {{
 *   category: string;
 *   type: string;
 *   startDate: string;
 *   duration?: number;
 *   notes?: string;
 * }} UsageRightsLease
 */

/**
 * @typedef {{
 *  getUsageRightsCategories: () => Promise<CategoryResponse[]>
 * }} EditsApi
 */

editsApi.factory('editsApi', ['$q', 'mediaApi', function($q, mediaApi) {

    var root;
    var categories;
    var filteredCategories;

    function getRoot() {
        return root || (root = mediaApi.root.follow('edits'));
    }

    function getUsageRightsCategories() {
        return categories || (categories = getRoot().follow('usage-rights-list').getData());
    }

    function getFilteredUsageRightsCategories() {
      return filteredCategories || (filteredCategories = getRoot().follow('filtered-usage-rights-list').getData());
    }

    return {
        getUsageRightsCategories,
        getFilteredUsageRightsCategories
    };
}]);
