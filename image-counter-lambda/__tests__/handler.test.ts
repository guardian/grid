import fns from "../src/handler";
import getCredentials from "../src/getCredentials";

jest.mock("../src/getCredentials");

describe("handler", () => {
  it("should get credentials from S3", async () => {
    fns.getCredentials = jest.fn(async () => "foo");
    await fns.handler();

    expect(getCredentials).toHaveBeenCalledWith("Foo");
  });
});
