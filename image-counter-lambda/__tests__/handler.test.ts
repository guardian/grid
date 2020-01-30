import fetch from "node-fetch";

import fns from "../src/handler";

jest.mock("node-fetch", () => jest.fn());
jest.mock("../src/getCredentials");

const imageCount = {
  catCount: 11,
  searchResponseCount: 11,
  indexStatsCount: 11
};

const credentials = { baseUrl: "someUrl", "X-Gu-Media-Key": "someKey" };

const promiseMock = jest.fn();

jest.mock("aws-sdk/clients/cloudwatch", () => {
  return class CloudWatch {
    putMetricData() {
      return {
        promise: promiseMock
      };
    }
  };
});

describe("handler", () => {
  beforeEach(() => {
    // @ts-ignore
    fns.getCredentials.mockImplementationOnce(() =>
      Promise.resolve(credentials)
    );

    // @ts-ignore
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        json: () => {
          return imageCount;
        }
      })
    );
  });

  describe("getImageCount", function() {
    it("should query the API with the correct credentials", async function() {
      const result = await fns.getImageCount(credentials);
      expect(result).toEqual(imageCount);
      expect(fetch).toHaveBeenCalledWith(
        credentials.baseUrl + "/management/imageCounts",
        {
          headers: {
            "X-Gu-Media-Key": "someKey"
          }
        }
      );
    });
  });

  describe("handler", function() {
    it("should get credentials from S3", async () => {
      expect(await fns.handler()).toEqual({
        statusCode: 200,
        body: `Metrics sent for metrics: ${JSON.stringify(imageCount)}`
      });
      expect(fns.getCredentials).toHaveBeenCalledTimes(1);
      expect(promiseMock).toHaveBeenCalledTimes(Object.keys(imageCount).length);
    });
  });
});
