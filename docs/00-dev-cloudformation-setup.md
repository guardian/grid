# DEV Cloudformation Setup

If you are working on this project as a Guardian employee we are using a shared DEV stack so these steps are not necessary.

## DEV Cloudformation Stack
The [cloudformation template](../cloud-formation/dev-template.json) defines the resources needed for a DEV environment.

There are a few helpful scripts included.

### Create
Create a stack by running:

```bash
./cloud-formation/scripts/create-dev-stack.sh <STACK_NAME>
```

Once all stack resources have been created, initialise the contents of your buckets:

```bash
./cloud-formation/scripts/post-dev-stack-creation.sh <STACK_NAME>
```

We use a single shared stack at the Guardian called `media-service-DEV`.

### Update
Update a stack by running:

```bash
./cloud-formation/scripts/update-dev-stack.sh <STACK_NAME>
```

### Delete
Delete a stack by running:

```bash
./cloud-formation/scripts/delete-dev-stack.sh <STACK_NAME>
```

### Note around IAM and Temporary Credentials obtained with `GetFederationToken`
If you are using temporary credentials obtained via `GetFederationToken` you will not be able to use these scripts
as you will not have permission to create IAM Users.

You will have to manage your DEV stack directly within the AWS web console instead.

## .properties files
Once you have a DEV stack running, you can generate the necessary`.properties` configuration files in `/etc/gu`.

This can be done by following the instructions [here](../docker/configs/generators/README.md).
