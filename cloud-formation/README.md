# Cloud Formation

The [template](./dev-template.json) outlines the AWS resources needed to develop on the Grid.

## Creating Stack

To create a stack, use the corresponding script in the [`scripts`](./scripts/) directory.

Once you have created the stack, you'll need to initialise the contents of your buckets:

```sh
./post-dev-stack-creation.sh
```

## Updating Stack

To update a stack, use the corresponding script in the [`scripts`](./scripts/) directory.

## Note around IAM and Temporary Credentials obtained with `GetFederationToken`
(This is particularily prevalent for Guardian developers using the Janus tool.)

If you are using temporary credentials obtained via `GetFederationToken` you will not be able to use these scripts as you will not have permission to IAM. You will have to create/update your DEV stack directly within the AWS web console instead.
