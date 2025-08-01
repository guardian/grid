// Utility functions for converting metadata filters to query syntax

/**
 * Convert metadata filters to query string components
 * @param {Array} filters Array of active metadata filters
 * @returns {Array} Array of query string parts that can be joined with spaces
 */
export function convertFiltersToQuery(filters) {
  const queryParts = [];

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
 * @param {string} value The value to escape
 * @returns {string} Escaped value
 */
function escapeQueryValue(value) {
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
 * @param {string} query The current query string
 * @returns {Object} Object with non-filter query and detected filters
 */
export function parseQueryForFilters(query) {
  if (!query) {
    return { baseQuery: '', detectedFilters: [] };
  }

  // This is a simplified parser - in reality you might want to use the existing query parser
  const filterFields = ['credit', 'source', 'imageType', 'keywords', 'subjects'];
  const detectedFilters = [];
  let baseQuery = query;

  // More robust regex patterns for each field
  filterFields.forEach(field => {
    const fieldFilters = [];
    
    // Pattern 1: Simple field:value
    const simpleRegex = new RegExp(`\\b${field}:([^\\s"]+)`, 'gi');
    
    // Pattern 2: field:"quoted value"
    const quotedRegex = new RegExp(`\\b${field}:"([^"]+)"`, 'gi');
    
    // Pattern 3: Handle OR groups like (field:value1 OR field:value2)
    const orGroupRegex = new RegExp(`\\(([^)]*\\b${field}:[^)]+)\\)`, 'gi');
    
    let matches;
    
    // Find OR groups first
    while ((matches = orGroupRegex.exec(query)) !== null) {
      const orGroup = matches[1];
      const orFieldRegex = new RegExp(`\\b${field}:("([^"]+)"|([^\\s)]+))`, 'gi');
      let orMatches;
      
      while ((orMatches = orFieldRegex.exec(orGroup)) !== null) {
        const value = orMatches[2] || orMatches[3]; // quoted or unquoted value
        if (value && !fieldFilters.includes(value)) {
          fieldFilters.push(value);
        }
      }
      
      // Remove the entire OR group from base query
      baseQuery = baseQuery.replace(matches[0], '').trim();
    }
    
    // Reset regex lastIndex after OR group processing
    quotedRegex.lastIndex = 0;
    simpleRegex.lastIndex = 0;
    
    // Find quoted field values
    while ((matches = quotedRegex.exec(baseQuery)) !== null) {
      const value = matches[1];
      if (value && !fieldFilters.includes(value)) {
        fieldFilters.push(value);
      }
      // Remove this match from base query
      baseQuery = baseQuery.replace(matches[0], '').trim();
    }
    
    // Reset regex lastIndex after quoted processing
    simpleRegex.lastIndex = 0;
    
    // Find simple field values (only if not already found in OR groups or quotes)
    while ((matches = simpleRegex.exec(baseQuery)) !== null) {
      const value = matches[1];
      if (value && !fieldFilters.includes(value)) {
        fieldFilters.push(value);
      }
      // Remove this match from base query
      baseQuery = baseQuery.replace(matches[0], '').trim();
    }
    
    // Add to detected filters if we found any values
    if (fieldFilters.length > 0) {
      detectedFilters.push({
        field,
        label: getFieldLabel(field),
        values: fieldFilters
      });
    }
  });

  // Clean up the base query - remove extra spaces and OR keywords left behind
  baseQuery = baseQuery
    .replace(/\s+OR\s+/gi, ' ') // Remove standalone OR keywords
    .replace(/\(\s*\)/g, '') // Remove empty parentheses
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  return { baseQuery, detectedFilters };
}

/**
 * Get display label for a field
 * @param {string} field
 * @returns {string}
 */
function getFieldLabel(field) {
  const labelMap = {
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
 * @param {string} baseQuery The non-filter part of the query
 * @param {Array} filters Array of active metadata filters
 * @returns {string} Combined query string
 */
export function combineQueryWithFilters(baseQuery, filters) {
  const filterQueries = convertFiltersToQuery(filters);
  const allParts = [baseQuery, ...filterQueries].filter(part => part.trim().length > 0);
  return allParts.join(' ').trim();
}
