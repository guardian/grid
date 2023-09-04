import "source-map-support/register";
import {GuRootExperimental} from "@guardian/cdk/lib/experimental/constructs";
import { GridExtras } from "../lib/grid-extras";

const app = new GuRootExperimental();

const stack = "media-service";

const env = {
  region: "eu-west-1"
};

new GridExtras(app, "grid-extras-TEST", { env, stack, stage: "TEST" });
new GridExtras(app, "grid-extras-PROD", { env, stack, stage: "PROD" });
