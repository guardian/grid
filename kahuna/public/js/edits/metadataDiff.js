function isDefined(value){return typeof value !== 'undefined';}
function isUndefined(value) { return typeof value === 'undefined'; }
//These two functions have been copied from angular.js and will be deleted.

export const getMetadataDiff = (image, metadata) => {
  var diff = {};

  // jscs has a maximumLineLength of 100 characters, hence the line break
  var keys = new Set(Object.keys(metadata).concat(
    Object.keys(image.data.originalMetadata)));

  // Keywords, peopleInImage and subjects are arrays, the comparison below only works with string comparison.
  // For simplicity, ignore them as we're not updating these fields at the moment.
  keys.delete('keywords');
  keys.delete('subjects');
  keys.delete('peopleInImage');

  keys.forEach((key) => {
    if (metadata[key] && isUndefined(image.data.originalMetadata[key])) {
      diff[key] = metadata[key];
    } else if (metadata[key] !== image.data.originalMetadata[key] &&
      isDefined(image.data.originalMetadata[key])) {
      // if the user has provided an override of '' (e.g. they want remove the title),
      // angular sets the value in the object to undefined.
      // We need to use an empty string in the PUT request to obey user input.
      diff[key] = metadata[key] || '';
    }
  });

  return diff;
};
