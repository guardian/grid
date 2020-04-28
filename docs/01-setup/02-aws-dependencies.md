# AWS dependencies

Grid requires various AWS resources to run, such as S3 buckets and DynamoDB tables.

## Credentials
Grid interacts with various AWS resources with the
[profile](https://docs.aws.amazon.com/cli/latest/userguide/cli-multiple-profiles.html) `media-service`.

Create a profile using the AWS CLI:

```shell script
aws configure --profile media-service
```

By default, we use [localstack](https://github.com/localstack/localstack) in DEV, so the credentials for this profile don't need to be valid.

Developers working at the Guardian can use Janus to get credentials.

## Resources
The resources needed to run Grid locally are defined in the CloudFormation template [here](../../dev/cloudformation/grid-dev-core.yml).

During the setup process, Grid will create the resources automatically.
