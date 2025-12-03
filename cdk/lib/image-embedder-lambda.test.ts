import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { MediaService } from "./image-embedder-lambda";

describe("The MediaService stack", () => {
  it("matches the snapshot", () => {
    const app = new App();
    const stack = new MediaService(app, "ImageEmbedderLambda", { stack: "media-service", stage: "TEST" });
    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
