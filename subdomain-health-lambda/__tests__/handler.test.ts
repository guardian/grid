import fetch from "node-fetch";
import { handler, fns } from "../src/handler";
import { SubdomainConfig } from "../src/getConfigFromS3";

jest.mock("node-fetch", () => jest.fn());
jest.mock("../src/getConfigFromS3");

const subdomains: SubdomainConfig = {
  subdomains: [{ name: "someName", endpoint: "someEndpoint" }]
};

const getStatusSpy = jest.spyOn(fns, "getStatus");
const putMetricDataMock = jest.fn(() => {
  return { promise: () => {} };
});

jest.mock("aws-sdk/clients/cloudwatch", () => {
  return class CloudWatch {
    private putMetricData: jest.Mock;
    constructor() {
      this.putMetricData = putMetricDataMock;
    }
  };
});

function mockFetch(status = 200): void {
  // @ts-ignore
  fetch.mockImplementation(() => Promise.resolve({ status }));
}

function mockGetSubdomains(subdomains: SubdomainConfig): void {
  // @ts-ignore
  fns.getConfigFromS3 = jest.fn(() => Promise.resolve(subdomains));
}

describe("handler", () => {
  beforeEach(() => {
    mockGetSubdomains(subdomains);
    mockFetch();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getStatus", function() {
    it("should query a domain and return the status code", async function() {
      const statusCode = 200;
      const someDomain = { name: "someName", endpoint: "someEndpoint" };
      mockFetch(statusCode);

      const result = await fns.getStatus(someDomain);
      expect(result).toEqual({ domain: someDomain, response: statusCode });
      expect(fetch).toHaveBeenCalledWith(someDomain.endpoint);
    });

    it("returns -1 if error in fetch", async function() {
      const someDomain = subdomains.subdomains[0];
      // @ts-ignore
      fetch.mockImplementation(() => Promise.reject());
      const result = await fns.getStatus(someDomain);
      expect(result).toEqual({ domain: someDomain, response: -1 });
      expect(fetch).toHaveBeenCalledWith(someDomain.endpoint);
    });
  });

  describe("handler", function() {
    it("should get subdomains from S3", async () => {
      expect(await handler()).toEqual({
        statusCode: 200,
        body: `Metrics sent for metrics: ${JSON.stringify(
          subdomains.subdomains
        )}`
      });
      expect(fns.getConfigFromS3).toHaveBeenCalledTimes(1);
      expect(getStatusSpy).toHaveBeenCalledWith({
        name: "someName",
        endpoint: "someEndpoint"
      });
      expect(putMetricDataMock).toHaveBeenCalledWith(
        expect.objectContaining({
          MetricData: expect.arrayContaining([
            expect.objectContaining({ MetricName: "StatusCode", Value: 200 })
          ])
        })
      );
    });

    it("should work for multiple subdomains from S3", async () => {
      const subdomains: SubdomainConfig = {
        subdomains: [
          { name: "subdomain1", endpoint: "endpoint1" },
          { name: "subdomain2", endpoint: "endpoint2" }
        ]
      };
      mockGetSubdomains(subdomains);

      expect(await handler()).toEqual({
        statusCode: 200,
        body: `Metrics sent for metrics: ${JSON.stringify([
          { name: "subdomain1", endpoint: "endpoint1" },
          { name: "subdomain2", endpoint: "endpoint2" }
        ])}`
      });

      expect(fns.getConfigFromS3).toHaveBeenCalledTimes(1);
      getStatusSpy.mock.calls.map((call, index) =>
        // `call` returns an array of arguments, so the first one is the first arg to getStatus
        expect(call).toEqual([subdomains.subdomains[index]])
      );
      expect(putMetricDataMock).toHaveBeenCalledTimes(2);
    });
  });
});
