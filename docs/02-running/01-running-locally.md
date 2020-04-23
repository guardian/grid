# Running locally

By now you should have:
- installed all software dependencies
- created an AWS profile called `media-service`
- created an AWS CloudFormation stack
- setup nginx proxies
- generated configuration files in `/etc/gu`

We can start Grid by using the [dev-start.sh](../../dev-start.sh) script:

```shell script
./dev-start.sh
```

The following flags are available for `dev-start.sh`:
- `--debug` which will make port `5005` available for [debugging in IntelliJ](https://www.jetbrains.com/help/idea/attaching-to-local-process.html)
- `--ship-logs` which will ship logs to a [local elk](https://github.com/guardian/local-elk) stack over tcp on port `5000`

## `the_pingler.sh`
Grid consists of many micro-services. Some services don't compile until you hit them for the first time.
There is a script included that will do this for you called [the_pingler.sh](../the_pingler.sh).
{
This is a simple shell script that keeps pinging the healthcheck endpoints of the various
services and reports it via the colour of the URL.  This is needed because some services do
not start to function correctly until they have been contacted at least once.
It's recommended to keep this running in the background while you have the stack started up
and keep it running in a background terminal.

```bash
./the_pingler.sh
```

If everything has worked, we should be able to access Grid in a browser on `https://media.local.dev-gutools.co.uk`.
