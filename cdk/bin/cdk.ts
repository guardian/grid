import "source-map-support/register";
import { GuRoot } from "@guardian/cdk/lib/constructs/root";
import { ImageEmbedder } from "../lib/image-embedder-lambda";

const app = new GuRoot();
new ImageEmbedder(app, "ImageEmbedderLambda-euwest-1-PROD", { stack: "media-service", stage: "PROD", env: { region: "eu-west-1" } });
new ImageEmbedder(app, "ImageEmbedderLambda-euwest-1-TEST", { stack: "media-service", stage: "TEST", env: { region: "eu-west-1" } });
