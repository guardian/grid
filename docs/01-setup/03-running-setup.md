# Running setup

There are a number of files and configuration needed to run Grid.
The [`setup.sh`](../../dev/script/setup.sh) script will do all the hard work!

`setup.sh` will do a number of things:
- Launch the required Docker containers as defined in [`docker-compose.yml`](../../docker-compose.yml)
- Use the [CloudFormation templates](../../dev/cloudformation) to create AWS resources within [localstack](https://github.com/localstack/localstack)
- Setup NGINX proxies using [dev-nginx](https://github.com/guardian/dev-nginx)
- Generate configuration files in `~/.grid`
- Optionally create an authentication stack

## Running
From the project root, run:

```shell script
./dev/script/setup.sh
```

This process will take a little while to complete.

### Available flags
There are a few options available for `setup.sh`.

#### `--clean`
Adding the `--clean` flag will result in the Docker containers and any temporary files from previous runs of Grid to be removed before proceeding.

This is useful if you want to be sure there are no remnants of another environment to interfere with your work.

#### `--with-local-auth`
Adding the `--with-local-auth` flag will result in:
- a local [authentication stack](../../dev/cloudformation/grid-dev-auth.yml) being created
- the generation of pan-domain-authentication settings and a number of [users](../../dev/config/users.json)

Using this flag is encouraged if you're outside the Guardian and want to run Grid locally without setting up pan-domain-authentication for real.
