export const getMetadataDiff = (image, metadata) => {
  const diff = {};
  const originalMetadata = image.data.originalMetadata;
  // jscs has a maximumLineLength of 100 characters, hence the line break
  var keys = new Set(
    Object.keys(metadata).concat(Object.keys(originalMetadata))
  );

  keys.forEach((key) => {
    if (JSON.stringify(originalMetadata[key]) === JSON.stringify(metadata[key])) {
      return;
    }

    // if the user has provided an override of '' (e.g. they want remove the title),
    // angular sets the value in the object to undefined.
    // We need to use an empty string in the PUT request to obey user input.
    diff[key] = metadata[key] || "";
  });

  return diff;
};
