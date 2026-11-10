import { prepend, append } from '../util/constants/editOptions';

export const domainMetadataElasticsearchPath = (specName, fieldName) =>
  `metadata.domainMetadata.${specName}.${fieldName}`;

const isEmptyValue = (value) =>
  value === undefined || value === null || value === '';

const valuesEqual = (a, b) => {
  if (a === b) {
    return true;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
};

/**
 * Reads a single domain metadata field value from an image, normalising any
 * "no value" representation to `undefined`.
 */
export const readDomainMetadataFieldValue = (image, specName, fieldName) => {
  const metadata = image && image.data ? image.data.metadata : undefined;
  const domainMetadata = metadata ? metadata.domainMetadata : undefined;
  const model = domainMetadata ? domainMetadata[specName] : undefined;
  const value = model ? model[fieldName] : undefined;

  return isEmptyValue(value) ? undefined : value;
};

/**
 * The distinct values held across the selected images for a single domain metadata
 * field. An image holding no value contributes `undefined`, so that a selection where
 * some images have a value and others do not is correctly reported as having
 * multiple values.
 */
export const getDistinctDomainMetadataValues = (images, specName, fieldName) =>
  images
    .map(image => readDomainMetadataFieldValue(image, specName, fieldName))
    .reduce((distinctValues, value) => {
      if (!distinctValues.some(distinctValue => valuesEqual(distinctValue, value))) {
        distinctValues.push(value);
      }
      return distinctValues;
    }, []);

/**
 * Domain metadata fields are searchable via a chip when a field alias has been
 * configured against the field's elasticsearch path. Matching is on the path rather
 * than the field name, as an alias may be named differently to the field.
 */
export const findDomainMetadataFieldAlias = (fieldAliases, specName, fieldName) => {
  const path = domainMetadataElasticsearchPath(specName, fieldName);
  const fieldAlias = (fieldAliases || []).find(_ => _.elasticsearchPath === path);

  return fieldAlias ? fieldAlias.alias : undefined;
};

/**
 * Overwrite / add before / add after is only offered for string fields that opt in
 * via the `allowEditOptions` domain metadata configuration flag.
 */
export const supportsEditOptions = (field) =>
  field.fieldType === 'string' && field.allowEditOptions === true;

/**
 * Combines the entered value with an image's current value according to the chosen
 * edit option. An image holding no value takes the entered value as-is, rather than
 * being given a leading / trailing separator.
 */
export const getNewDomainMetadataFieldValue = (currentValue, value, editOption) => {
  if (isEmptyValue(currentValue)) {
    return value;
  }

  switch (editOption) {
    case prepend.key:
      return value + ' ' + currentValue;
    case append.key:
      return currentValue + ' ' + value;
    default:
      return value;
  }
};
