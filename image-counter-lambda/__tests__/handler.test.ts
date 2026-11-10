import fetch from "node-fetch";

import fns from "../src/handler";
import getCredentials from "../src/getCredentials";

jest.mock("node-fetch", () => jest.fn());
jest.mock("../src/getCredentials");

const imageCount = {
  catCount: 11,
  searchResponseCount: 11,
  indexStatsCount: 11
};

const credentials = { baseUrl: "someUrl", "X-Gu-Media-Key": "someKey" };

const mockSend = jest.fn();

jest.mock("@aws-sdk/client-cloudwatch", () => {
  return {
    CloudWatchClient: jest.fn().mockImplementation(() => ({
      send: mockSend
    })),
    PutMetricDataCommand: jest.fn().mockImplementation((params) => params)
  };
});

describe("handler", () => {
  beforeEach(() => {
    // @ts-ignore
    getCredentials = jest.fn(() => Promise.resolve(credentials));

    // @ts-ignore
    fetch.mockImplementation(() =>
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
      expect(getCredentials).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledTimes(Object.keys(imageCount).length);
    });

    it("should log out image counts", async () => {
      // @ts-ignore
      global.console = {
        warn: jest.fn(),
        log: jest.fn()
      };

      // @ts-ignore
      fetch = jest.fn(() => "ff");

      expect(await fns.handler()).toEqual({
        statusCode: 200,
        body: `Metrics sent for metrics: ${JSON.stringify(imageCount)}`
      });
      expect(global.console.log).toHaveBeenCalledWith(
        "image counts",
        imageCount
      );
    });
  });
});
