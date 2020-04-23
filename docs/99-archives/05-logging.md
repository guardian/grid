# Logging

## Local ELK
 
Clone local-elk and follow usage instructions in readme.

- Checkout Grid branch aa-local-elk
- Run ./dev-start.sh --ship-logs
- Run ./the-pingler.sh
- Open logs.local.dev-gutools.co.uk in the browser
- Follow the Kibana instructions to create an index pattern (one off)

## Stopwatch

Wrap any function `do_thing` with a call to Stopwatch: `Stopwatch("thing") {do_thing}` to get
a log line on success giving the duration in ns.
