# Running services

Grid consists of many micro-services. There are a few different ways to start them.
Note that some services don't compile until you hit them for the first time.
There is a script included that will do this for you called **the_pingler.sh**

## Manually
From the **project root**:

- [elasticsearch](../elasticsearch/dev-start.sh)
- media-api `sbt "project media-api" "run 9001"`
- thrall `sbt "project thrall" "run 9002"`
- image-loader `sbt "project image-loader" "run 9003"`
- ftp-watcher (optional, and soon to be deprecated) `sbt -Dftp.active=true "project ftp-watcher" "run 9004"`
- kahuna `sbt "project kahuna" "run 9005"`
- cropper `sbt "project cropper" "run 9006"`
- metadata-editor `sbt "project metadata-editor" "run 9007"`
- collections `sbt "project collections" "run 9010"`
- auth `sbt "project auth" "run 9011"`

## [run.sh](../run.sh)
`run.sh` is a single script to start all the services.

## [run_tmux.sh](../run_tmux.sh)
`run_tmux.sh` is a single script to start all the services in a tmux environment.

## [GridRunner](https://github.com/guardian/grid_runner/)
Grid Runner helps manage grid micro-services

Install grid_runner:

        $ gem install grid_runner

* aliases makes life better (in .bash_profile or somewhere similar):
        alias gr=grid_runner
* remember to update once in a while
* create a 'logs' directory if it does not exist

From the project root:

        $ gr list
        $ gr run all
        $ gr kill kahuna media-api
        $ gr restart elasticsearch
        $ gr log thrall usage

* all commands take either "all" or a space-delimited list of apps

you can see the different application names in the Procfile (in project root)

## [the_pingler.sh]
This is a simple shell script that keeps pinging the healtcheck endpoints of the various
services and reports it via the colour of the URL.  This is needed because some services do
not start to function correctly until they have been contacted at least one.
It's recommended to keep this running in the background while you have the stack started up.

From the project root:

		$ ./the_pingler.sh

and keep it running in a background terminal

## Docker
Its possible to run Grid using Docker. Please follow the [README](../docker/README.md#setup) beforehand.

To run the containers, run:

```sh
docker-compose up  -d
```

NB: This has only been tested in DEV.
