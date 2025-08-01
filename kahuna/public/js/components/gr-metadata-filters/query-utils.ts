// Utility functions for converting metadata filters to query syntax

export interface MetadataFilter {
  field: string;
  label: string;
  values: string[];
}

/**
 * Convert metadata filters to query string components
 * @param filters Array of active metadata filters
 * @returns Array of query string parts that can be joined with spaces
 */
export function convertFiltersToQuery(filters: MetadataFilter[]): string[] {
  const queryParts: string[] = [];

  filters.forEach(filter => {
    if (filter.values.length === 0) return;

    // For each field, create OR conditions for multiple values
    if (filter.values.length === 1) {
      // Single value: field:value
      const value = escapeQueryValue(filter.values[0]);
      queryParts.push(`${filter.field}:${value}`);
    } else {
      // Multiple values: (field:value1 OR field:value2)
      const valueQueries = filter.values.map(value => {
        const escapedValue = escapeQueryValue(value);
        return `${filter.field}:${escapedValue}`;
      });
      queryParts.push(`(${valueQueries.join(' OR ')})`);
    }
  });

  return queryParts;
}

/**
 * Escape special characters in query values
 * @param value The value to escape
 * @returns Escaped value
 */
function escapeQueryValue(value: string): string {
  // If the value contains spaces or special characters, quote it
  if (/[\s"':()]/g.test(value)) {
    // Escape quotes within the value and wrap in quotes
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * Parse existing query to extract metadata filter parts
 * This is a simple implementation - could be enhanced to handle more complex queries
 * @param query The current query string
 * @returns Object with non-filter query and detected filters
 */
export function parseQueryForFilters(query: string): {
  baseQuery: string;
  detectedFilters: MetadataFilter[];
} {
  if (!query) {
    return { baseQuery: '', detectedFilters: [] };
  }

  // This is a simplified parser - in reality you might want to use the existing query parser
  const filterFields = ['credit', 'source', 'imageType', 'keywords', 'subjects'];
  const detectedFilters: MetadataFilter[] = [];
  let baseQuery = query;

  // Simple regex to find field:value patterns
  filterFields.forEach(field => {
    const regex = new RegExp(`\\b${field}:("([^"]+)"|([^\\s]+))`, 'g');
    const matches = [...query.matchAll(regex)];
    
    if (matches.length > 0) {
      const values = matches.map(match => match[2] || match[3]); // quoted or unquoted value
      if (values.length > 0) {
        detectedFilters.push({
          field,
          label: getFieldLabel(field),
          values
        });
        
        // Remove these filter parts from the base query
        matches.forEach(match => {
          baseQuery = baseQuery.replace(match[0], '').trim();
        });
      }
    }
  });

  // Clean up the base query
  baseQuery = baseQuery.replace(/\s+/g, ' ').trim();

  return { baseQuery, detectedFilters };
}

/**
 * Get display label for a field
 */
function getFieldLabel(field: string): string {
  const labelMap: Record<string, string> = {
    'credit': 'Credit/Agency',
    'source': 'Source', 
    'imageType': 'Image Type',
    'keywords': 'Keywords',
    'subjects': 'Subjects'
  };
  return labelMap[field] || field;
}

/**
 * Combine base query with metadata filters to create final query
 * @param baseQuery The non-filter part of the query
 * @param filters Array of active metadata filters
 * @returns Combined query string
 */
export function combineQueryWithFilters(baseQuery: string, filters: MetadataFilter[]): string {
  const filterQueries = convertFiltersToQuery(filters);
  const allParts = [baseQuery, ...filterQueries].filter(part => part.trim().length > 0);
  return allParts.join(' ').trim();
}
