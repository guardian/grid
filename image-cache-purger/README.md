# Image cache purger

A JVM AWS Lambda responsible for purging cached Grid images.

The Lambda entry point is:

```text
com.gu.mediaservice.ImageCachePurger::handleRequest
```

## Fastly API key

Before deploying, create an AWS Secrets Manager secret in the deployment account and region named:

```text
/<STAGE>/media-service/image-cache-purger/fastly-api-key
```

Store the raw Fastly API key as the secret's `SecretString`. The CDK stack grants the Lambda permission to read only
this secret and passes its ARN through `FASTLY_API_KEY_SECRET_ID`; the secret value is loaded and cached at runtime.
Do not put the key itself in Lambda environment variables, source control, or CDK configuration.

For each S3 object key received through SQS, the Lambda sends an authenticated `POST` to the stage's Fastly service.
Transport errors and non-200 responses produce a failed `Try`; the SQS processor unwraps that result so the invocation
fails and SQS can retry it.

`FastlyPurger.verifyPurge` can be used by smoke or integration tests to request the public image with
`Fastly-Debug: 1`. It succeeds only when every Fastly cache hop reports `X-Cache: MISS`, every `X-Cache-Hits` value is
zero, and `Age` is absent or zero. It is not called after every purge because the verification request can repopulate
the cache and adds another external request to each invocation.

## Test

```bash
sbt 'image-cache-purger/test'
```

## Build the deployment artifact

```bash
sbt 'image-cache-purger/assembly'
```

This creates `image-cache-purger/target/scala-2.13/image-cache-purger.jar`.

