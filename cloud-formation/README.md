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
