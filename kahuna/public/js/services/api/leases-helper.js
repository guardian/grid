import angular from "angular";

function readLeases(image) {
  return image.data.leases.data;
}

export function getApiImageAndApiLeasesIfUpdated(image, apiImage, expectedLeases) {
    const apiLeases = readLeases(apiImage);
    const leases = readLeases(image);
    const apiImageAndApiLeases = {image: apiImage, leases: apiLeases};
    const isNewlyCreated = leases.lastModified === null;
    if (isNewlyCreated) {
      const apiImageLeasesAreCreated = apiLeases.lastModified !== null;
      if (apiImageLeasesAreCreated) {
        return apiImageAndApiLeases;
      } else {
        return undefined;
      }
    } else {
      const apiImageLeasesAreUpdated = function() {
        const currentLastModified = new Date(apiLeases.lastModified);
        const previousLastModified = new Date(leases.lastModified);
        return currentLastModified > previousLastModified;
      };

      const compareExpectedLeasesAndUpdatedLeases = function() {
        const toComparableLease = function(lease) {
          return {
            createdAt: (lease.createdAt instanceof Date) ? lease.createdAt : new Date(lease.createdAt),
            access: lease.access
          };
        };
        const comparableUpdatedLeases = apiLeases.leases.map((lease) => toComparableLease(lease));
        const comparableExpectedLeases = expectedLeases.map((lease) => toComparableLease(lease));

        return JSON.stringify(comparableUpdatedLeases) === JSON.stringify(comparableExpectedLeases);
      };

      if (angular.isDefined(expectedLeases) && apiImageLeasesAreUpdated() && compareExpectedLeasesAndUpdatedLeases()) {
        return apiImageAndApiLeases;
      } else  if (!angular.isDefined(expectedLeases) && apiImageLeasesAreUpdated()) {
        return apiImageAndApiLeases;
      } else {
        return undefined;
      }
    }
  };


