# Accessing logs

Grid logs quite heavily to provide an insight into it's usage, behaviour and health.

By default, each micro-service logs to their relative `logs` directory; `kahuna`'s logs are in `./kahuna/logs/`.

In PROD, we push logs to an [ELK stack](https://www.elastic.co/what-is/elk-stack) using the [kinesis-logback-appender](https://github.com/guardian/kinesis-logback-appender).
An ELK stack provides a very simple and easy to use way of interrogating logs.

We can run an ELK stack locally using [local-elk](https://github.com/guardian/local-elk).
Once we have local-elk running, we can ship logs to it using the `--ship-logs` flag on the `dev-start.sh` script:

```shell script
./dev-start --ship-logs
```

## Stopwatch
Wrap any function `do_thing` with a call to Stopwatch: `Stopwatch("thing") {do_thing}` to get
a log line on success giving the duration in ns.
