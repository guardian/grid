import { getApiImageAndApiLeasesIfUpdated } from './leases-helper';
import moment from 'moment';

describe('leases-helper', () => {

  describe('tests for new created leases', () => {
      const newUploadedImage = {
        data: {
          leases: {
            data: {
              lastModified: null,
              leases: []
            }
          }
        }
      };

      it('should return undefined if leases are new created and image leases from api reponse are not up to date', () => {

        const apiImageWithoutLeases = {
          data: {
            leases: {
              data: {
                lastModified: null,
                leases: []
              }
            }
          }
        };

      const actual = getApiImageAndApiLeasesIfUpdated(newUploadedImage, apiImageWithoutLeases);
      expect(actual).toEqual(undefined);
    });

      it('should return result if leases are new created and image leases from api reponse are up to date', () => {
        const time = moment();

      const apiLeases = {
        lastModified: time.format(),
        leases: [
          {
            lastModified: time.format(),
            leases: [{}]
          }
        ]
      };

      const apiImageWithLeases = {
        data: {
          leases: {
            data: apiLeases
          }
        }
      };
      const actual = getApiImageAndApiLeasesIfUpdated(newUploadedImage, apiImageWithLeases);

      const expected = {image: apiImageWithLeases, leases: apiLeases};

      expect(actual).toEqual(expected);
    });
  });

  describe('tests for leases updates', () => {
    it('should return undefined if image leases from api are not up to date', () => {

      const time = moment();

      const clientSideImage = {
        data: {
          leases: {
            data: {
              lastModified: time.format(),
              leases: [
                {
                  lastModified: time.format(),
                  leases: [{}]
                }
              ]
            }
          }
        }
      };

      const olderTime = time.subtract(5, 'seconds');

      const apiImageWithOlderDate = {
        data: {
          leases: {
            data: {
              lastModified: olderTime,
              leases: [
                {
                  lastModified: olderTime,
                  leases: [{}]
                }
              ]
            }
          }
        }
      };

      const actual = getApiImageAndApiLeasesIfUpdated(clientSideImage, apiImageWithOlderDate);

      expect(actual).toEqual(undefined);
    });

    it('should return result if image leases from api are up to date', () => {
      const time = moment();

      const clientSideImage = {
        data: {
          leases: {
            data: {
              lastModified: time.format(),
              leases: [
                {
                  lastModified: time.format(),
                  leases: [{}]
                }
              ]
            }
          }
        }
      };

      const laterTime = time.add(5, 'seconds');

      const apiImageWithUpToDateLease = {
        data: {
          leases: {
            data: {
              lastModified: laterTime,
              leases: [
                {
                  lastModified: laterTime,
                  leases: [{}]
                }
              ]
            }
          }
        }
      };

      const actual = getApiImageAndApiLeasesIfUpdated(clientSideImage, apiImageWithUpToDateLease);

      const expected = {image: apiImageWithUpToDateLease, leases: apiImageWithUpToDateLease.data.leases.data};

      expect(actual).toEqual(expected);
    });
  });
});
