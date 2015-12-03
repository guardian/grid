# Cloud Formation

The [template](./dev-template.json) outlines the AWS resources needed to develop on the Grid.

## Creating Stack

As the usage-api is tightly coupled to the Guardian, there are two stacks to run in DEV:
- [core](./dev-template.json)
- [usage](./usage-template.json)

To create a stack, use the corresponding script in the [`scripts`](./scripts/) directory.

Once you have created the core stack, you'll need to initialise the contents of your buckets:

```sh
./post-dev-stack-creation.sh
```

## Updating Stack

To update a stack, use the corresponding script in the [`scripts`](./scripts/) directory.


## A note on the usage stack

The [Usage Updater lambda](../usage-updater) has a dependency on an SNS Topic which is created by the template.

Annoyingly, in order to create a lambda function within a Cloud Formation template whose code is in S3, the code artifact has to pre-exist within a S3 bucket.
This also means this S3 bucket cannot be included as a resource in the Cloud Formation stack and must be created beforehand.

Therefore, the steps to create a stack are:
 - Create S3 bucket
 - Upload an unconfigured version of the Usage Updater lambda.
 - Create stack
 - Upload a configured version of the Usage Updater lambda (see below).

Thankfully, there are [scripts](./scripts/) to help!

## Configuring Usage Updater lambda

The Usage Updater lambda works by executing based on messages in an SNS Topic. Messages get added to the SNS Topic using DynamoDb streams.

Annoyingly, it is not possible to create DynamoDb streams in Cloud Formation, so this has to be done manually too. Thankfully, there is a script for this too:

```sh
cd scripts
./usage-updater-lambda-resources.sh
```

Now that the plumbing between the lambda and the dynamodb table is complete, deploy the lambda as detailed in its README.
