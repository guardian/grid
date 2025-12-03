import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { ImageEmbedderLambda } from "./image-embedder-lambda";

describe("The ImageEmbedderLambda stack", () => {
  it("matches the snapshot", () => {
    const app = new App();
    const stack = new ImageEmbedderLambda(app, "ImageEmbedderLambda", { stack: "image-embedder-lambda", stage: "TEST" });
    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
