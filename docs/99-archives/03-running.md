# Running services

Once all the requirements have been installed and you have configuration files, Grid can be started by running the following from the project root:

```bash
./dev-start.sh
```

`./dev-start.sh` has two flags:

- `--debug` which will make port `5005` available for [debugging in IntelliJ](https://www.jetbrains.com/help/idea/attaching-to-local-process.html)
- `--ship-logs` which will ship logs to a [local elk](https://github.com/guardian/local-elk) stack over tcp on port `5000`.
Grid decorates log lines with markers which allow dashboards to be made to observe the health of the microservices.
Pushing these logs to a local ELK stack provides a nicer experience than tailing log files.

## Client Side code
Grid uses webpack to bundle client side code. Run the following from the `kahuna` directory to watch for changes:

```bash
npm run watch
```

## `the_pingler.sh`
Grid consists of many micro-services. Some services don't compile until you hit them for the first time.
There is a script included that will do this for you called [the_pingler.sh](../the_pingler.sh).

This is a simple shell script that keeps pinging the healthcheck endpoints of the various
services and reports it via the colour of the URL.  This is needed because some services do
not start to function correctly until they have been contacted at least once.
It's recommended to keep this running in the background while you have the stack started up
and keep it running in a background terminal.

```bash
./the_pingler.sh
```
