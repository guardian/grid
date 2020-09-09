# DEV Cloudformation Setup

**Not necessary for Guardian staff as we use a shared stack**

Grid needs various resources to run, such as DynamoDB tables, S3 buckets and IAM users.
These are defined in [this cloudformation template](../cloud-formation/dev-template.yaml).

Login to the AWS console and create a stack using this template. For the purposes of this documentation, 
we will assume the stack name has been set to `media-service-DEV`.

Once the stack has been created, initialise the contents of your buckets:

```bash
./cloud-formation/scripts/post-dev-stack-creation.sh media-service-DEV
```
