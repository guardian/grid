import type { GuStackProps } from "@guardian/cdk/lib/constructs/core";
import { GuStack } from "@guardian/cdk/lib/constructs/core";
import { GuLambdaFunction } from "@guardian/cdk/lib/constructs/lambda";
import type { App } from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { Architecture } from "aws-cdk-lib/aws-lambda";

export class MediaService extends GuStack {
  constructor(scope: App, id: string, props: GuStackProps) {
    super(scope, id, props);

    const LAMBDA_NODE_VERSION = lambda.Runtime.NODEJS_24_X;

    new GuLambdaFunction(
      this,
      'ImageEmbedderHandler',
      {
        fileName: 'image-embedder.zip',
        functionName: `image-embedder-${props.stage}`,
        runtime: LAMBDA_NODE_VERSION,
        architecture: Architecture.ARM_64,
        handler: 'dist.handler',
        app: 'image-embedder-handler',
      },
    );

  }
}