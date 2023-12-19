# Running locally

By now you should have:
- installed all software dependencies
- created an AWS profile called `media-service`
- run `setup.sh`

## `start.sh`
We can start Grid by using the [start.sh](../../dev/script/start.sh) script.

From the project root:

```shell script
./dev/script/start.sh
```

This process takes a little while to complete.

### Available flags
There are a few options available for `start.sh`.

#### `--debug`
Adding the `--debug` flag which will make port `5005` available for [debugging in IntelliJ](https://www.jetbrains.com/help/idea/attaching-to-local-process.html)
or your favourite IDE.

#### `--ship-logs`
Adding the `--ship-logs` flag will ship logs to a [local elk](https://github.com/guardian/local-elk) stack over tcp on port `5000`.
You'll need to be sure `local-elk` is running beforehand to sure port `5000` is open.

#### `--with-local-auth` or `--no-auth`
If you previously ran `setup.sh` using this flag, you'll also need to use it in `start.sh`.

#### (Guardian ONLY) `--use-TEST`
Connect to TEST for ElasticSearch and all  micro-services, except `auth`, `media-api` and `kahuna` (UI) - so that the Grid is pre-populated with images. This is useful for UI or API changes, e.g. working on the search interface.

## `the_pingler.sh`
Grid consists of many micro-services. Some services don't compile until you hit them for the first time.
There is a script included that will do this for you called [the_pingler.sh](../../dev/script/the_pingler.sh).

This is a simple shell script that keeps pinging the healthcheck endpoints of the various
services and reports it via the colour of the URL.  This is needed because some services do
not start to function correctly until they have been contacted at least once.
It's recommended to keep this running in the background while you have the stack started up
and keep it running in a background terminal.

```shell script
./dev/script/the_pingler.sh
```

## Accessing Grid
If everything has worked, we should be able to access Grid in a browser on `https://media.local.dev-gutools.co.uk`
where we'll begin an authentication flow.

If you've used the `--with-local-auth` flag you'll be directed to `localhost:9014` for authentication.
This is the [oidc-provider](../../dev/oidc-provider) and we can login to Grid using one of the users defined in
[`users.json`](../../dev/config/users.json), for example `grid-demo-account@guardian.co.uk`. There isn't a password, so enter any value.

If you haven't used the `--with-local-auth` flag, you'll begin a Google authentication flow.

If you have used the `--no-auth` flag you'll be signed in automatically as John Doe (with no oauth flow) and will have ALL permissions.

Note that there's currently a 20MB limit per file on direct/legacy uploads to image-loader (see `client_max_body_size` in nginx mappings). Theoretically you could upload such large files directly to the S3watcher bucket with something like `aws s3 cp --endpoint http://localhost:4576 ...`.
No such limit applies to the queue-based ingestion (see https://github.com/guardian/grid/pull/4201), which is the default for a fresh local setup.

## Cerebro

To inspect the elasticsearch database, cerebro is included as part of the grids local stack.
It can be accessed http://localhost:9090/#/connect?host=http:%2F%2Felasticsearch:9200
For cerebro, the address of the elasticsearch instance is `http://elasticsearch:9200`
