import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useState, useEffect } from "react";

import "./gr-metadata-filters.css";
import { combineQueryWithFilters, parseQueryForFilters } from './query-utils.js';

export interface MetadataFilter {
  field: string;
  label: string;
  values: string[];
}

export interface MetadataFiltersProps {
  activeFilters: MetadataFilter[];
  currentQuery: string;
  onChange: (filters: MetadataFilter[]) => void;
}

export interface MetadataFiltersWrapperProps {
  props: MetadataFiltersProps;
}

interface AggregationBucket {
  key: string;
  count: number;
}

interface AggregationResponse {
  data: AggregationBucket[];
  total: number;
}

// Configuration for which fields to show as filters
const FILTER_FIELDS = [
  { field: 'credit', label: 'Credit/Agency', priority: 1 },
  { field: 'source', label: 'Source', priority: 2 },
  { field: 'imageType', label: 'Image Type', priority: 3 },
  { field: 'keywords', label: 'Keywords', priority: 4 },
  { field: 'subjects', label: 'Subjects', priority: 5 },
  // { field: 'usageRights.supplier', label: 'Supplier', priority: 6 }, // TODO: Need to handle nested fields
];

const MetadataFilters: React.FC<MetadataFiltersWrapperProps> = ({ props }) => {
  const [filterData, setFilterData] = useState<Record<string, AggregationBucket[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [expandedFilters, setExpandedFilters] = useState<Record<string, boolean>>({});
  const [currentActiveFilters, setCurrentActiveFilters] = useState<MetadataFilter[]>([]);

  // Get mediaApi service from Angular
  const getMediaApi = (): any => {
    const injector = angular.element(document.body).injector();
    return injector ? injector.get('mediaApi') : null;
  };

  // Parse query to extract current filter state
  const parseCurrentQuery = (query: string): MetadataFilter[] => {
    if (!query) return [];
    
    const { detectedFilters } = parseQueryForFilters(query);
    return detectedFilters;
  };

  // Update internal state when props change
  useEffect(() => {
    const parsedFilters = parseCurrentQuery(props.currentQuery);
    setCurrentActiveFilters(parsedFilters);
  }, [props.currentQuery]);

  // Also sync with props.activeFilters if they change externally
  useEffect(() => {
    setCurrentActiveFilters(props.activeFilters);
  }, [props.activeFilters]);

  // Load aggregation data for a specific field
  const loadAggregationData = async (field: string) => {
    const mediaApi = getMediaApi();
    if (!mediaApi) {
      console.error('MediaApi service not available');
      return;
    }

    setLoading(prev => ({ ...prev, [field]: true }));
    
    try {
      const response = await mediaApi.metadataAggregation(field, {
        q: props.currentQuery,
        size: 20
      });
      
      if (response && response.data) {
        setFilterData(prev => ({
          ...prev,
          [field]: response.data
        }));
      }
    } catch (error) {
      console.error(`Error loading aggregation data for ${field}:`, error);
    } finally {
      setLoading(prev => ({ ...prev, [field]: false }));
    }
  };

  // Load data for all fields when component mounts or query changes
  useEffect(() => {
    FILTER_FIELDS.forEach(({ field }) => {
      loadAggregationData(field);
    });
  }, [props.currentQuery]);

  // Handle filter value selection
  const handleFilterValueToggle = (field: string, value: string) => {
    const fieldConfig = FILTER_FIELDS.find(f => f.field === field);
    if (!fieldConfig) return;

    const currentFilter = currentActiveFilters.find(f => f.field === field);
    const newFilters = [...currentActiveFilters];

    if (currentFilter) {
      // Field already has filters
      if (currentFilter.values.includes(value)) {
        // Remove the value
        currentFilter.values = currentFilter.values.filter(v => v !== value);
        if (currentFilter.values.length === 0) {
          // Remove the entire filter if no values left
          const index = newFilters.findIndex(f => f.field === field);
          newFilters.splice(index, 1);
        }
      } else {
        // Add the value
        currentFilter.values.push(value);
      }
    } else {
      // Add new filter
      newFilters.push({
        field,
        label: fieldConfig.label,
        values: [value]
      });
    }

    setCurrentActiveFilters(newFilters);
    props.onChange(newFilters);
  };

  // Toggle filter expansion
  const toggleFilterExpansion = (field: string) => {
    setExpandedFilters(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  // Get active values for a field
  const getActiveValues = (field: string): string[] => {
    const filter = currentActiveFilters.find(f => f.field === field);
    return filter ? filter.values : [];
  };

  // Clear all filters for a field
  const clearFieldFilters = (field: string) => {
    const newFilters = currentActiveFilters.filter(f => f.field !== field);
    setCurrentActiveFilters(newFilters);
    props.onChange(newFilters);
  };

  return (
    <div className="metadata-filters">
      <div className="metadata-filters__header">
        <h3>Filters</h3>
        {currentActiveFilters.length > 0 && (
          <button 
            className="metadata-filters__clear-all"
            onClick={() => {
              setCurrentActiveFilters([]);
              props.onChange([]);
            }}
          >
            Clear All
          </button>
        )}
      </div>

      <div className="metadata-filters__list">
        {FILTER_FIELDS.map(({ field, label }) => {
          const data = filterData[field] || [];
          const isLoading = loading[field];
          const isExpanded = expandedFilters[field];
          const activeValues = getActiveValues(field);
          const hasActiveValues = activeValues.length > 0;

          // Show top 5 items when collapsed, all when expanded
          const visibleData = isExpanded ? data : data.slice(0, 5);
          const hasMore = data.length > 5;

          return (
            <div key={field} className={`metadata-filter ${hasActiveValues ? 'metadata-filter--active' : ''}`}>
              <div className="metadata-filter__header">
                <span className="metadata-filter__label">{label}</span>
                {hasActiveValues && (
                  <button 
                    className="metadata-filter__clear"
                    onClick={() => clearFieldFilters(field)}
                    title="Clear filter"
                  >
                    ×
                  </button>
                )}
              </div>

              {isLoading ? (
                <div className="metadata-filter__loading">Loading...</div>
              ) : (
                <>
                  <div className="metadata-filter__values">
                    {visibleData.map(({ key, count }) => {
                      const isSelected = activeValues.includes(key);
                      return (
                        <label key={key} className={`metadata-filter__value ${isSelected ? 'metadata-filter__value--selected' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleFilterValueToggle(field, key)}
                          />
                          <span className="metadata-filter__value-label">{key}</span>
                          <span className="metadata-filter__value-count">({count})</span>
                        </label>
                      );
                    })}
                  </div>

                  {hasMore && (
                    <button 
                      className="metadata-filter__toggle"
                      onClick={() => toggleFilterExpansion(field)}
                    >
                      {isExpanded ? 'Show Less' : `Show All (${data.length})`}
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Export the Angular component
export const metadataFiltersModule = angular
  .module('gr.metadataFilters', [])
  .component('metadataFilters', react2angular(MetadataFilters, ["props"]));
