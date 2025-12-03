import "source-map-support/register";
import { GuRoot } from "@guardian/cdk/lib/constructs/root";
import { ImageEmbedderLambda } from "../lib/image-embedder-lambda";

const app = new GuRoot();
new ImageEmbedderLambda(app, "ImageEmbedderLambda-euwest-1-PROD", { stack: "image-embedder-lambda", stage: "PROD", env: { region: "eu-west-1" } });
new ImageEmbedderLambda(app, "ImageEmbedderLambda-euwest-1-TEST", { stack: "image-embedder-lambda", stage: "TEST", env: { region: "eu-west-1" } });
