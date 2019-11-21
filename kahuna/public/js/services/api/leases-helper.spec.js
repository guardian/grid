import { getApiImageAndApiLeasesIfUpdated } from './leases-helper';
import moment from 'moment';

describe('leases-helper', () => {

  describe('test for new created leases', () => {
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

      it('should return undefined if leases are new created and api reponse is not up to date yet', () => {

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

      it('should return result if leases are new created and api reponse isup to date', () => {
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

  describe('test for leases updates', () => {
    it('should return undefined if image from api still have not up to date leases', () => {

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

    it('should return result if image from api have up to date leases', () => {
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
