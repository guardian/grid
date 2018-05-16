# Running services

Once all the requirements have been installed and you have configuration files, Grid can be started by running the following from the project root:

```bash
./dev-start.sh
```

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
