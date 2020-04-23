# AWS dependencies

Grid requires various AWS resources to run, such as S3 buckets and DynamoDB tables.

## Credentials
Grid interacts with various AWS resources with the
[profile](https://docs.aws.amazon.com/cli/latest/userguide/cli-multiple-profiles.html) `media-service`.

Create a profile using the AWS CLI:

```shell script
aws configure --profile media-service
```

Developers working at the Guardian can use Janus to get credentials.

## Resources
The resources needed to run Grid locally are defines in the CloudFormation template [here](../../cloud-formation/dev-template.yaml).

Use this template to create a CloudFormation stack; for the purposes of this documentation we'll assume a stack name of `media-service-DEV`.

```shell script
aws cloudformation create-stack \
  --stack-name media-service-DEV \
  --template-body file://cloud-formation/dev-template.yaml \
  --profile media-service \
  --region eu-west-1
```
