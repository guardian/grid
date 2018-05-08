# Running services

Grid consists of many micro-services.

Some services don't compile until you hit them for the first time. 
There is a script included that will do this for you called [the_pingler.sh](../the_pingler.sh).

In DEV, Grid uses a local instance of elasticsearch and a number of AWS Cloud resources defined in the template. 

Grid can be started by running the following from the project root:

```bash
./dev-start.sh 
```

## `the_pingler.sh`
This is a simple shell script that keeps pinging the healtcheck endpoints of the various
services and reports it via the colour of the URL.  This is needed because some services do
not start to function correctly until they have been contacted at least once.
It's recommended to keep this running in the background while you have the stack started up 
and keep it running in a background terminal.

```bash
./the_pingler.sh
```
