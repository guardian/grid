# thrall

Thrall pulls messages from the event queue, interprets them, and modifies the Elasticsearch index accordingly.
Also appears to be responsible for the deleting or reaping of expired images.

## Compile

```
sbt thrall/compile
```


## Tests

```
sbt thrall/test
```

Fails immediately on M2 laptop while apparently trying to start functional test Docker dependencies from test code.
Move these dependencies to a start off docker-compose for an easier build.

Passes on an i386 machine.


## Packaging

The Guardian build.sbt no longer mentions riffraff.

They seem to be using JDebPackaging which is probably a wrapper around universal.

sbt docker is also a wrapper around universal so this probably makes things easier for us.

sbt dist and examining the contents of the .zip file seems to reflect the contents of the container image.

```
sbt thrall/docker:publishLocal
```

## Configuration

`GridConfigLoader` searches many locations for application configuration.
The locations it looks in is controlled by the stage file in `/etc/gu/stage` which would contain `PROD`.

Setting to `PROD` will see `/etc/grid/thrall.conf` checked; allows is to use `/etc/grid` is our config mount point.

## Run


### Disable Kinesis log shipping

Set `logger.kinesis.enabled=false`

Starts up; complains about Kinesis and S3 permissions.


### Bypass Guardian Permissions

Blocks further start up until loaded.
Why is Thrall even user facing is a question for another day.

Set `authorisation.provider` and `authentication.providers.user` to local in common.conf.

```
docker run -it --mount type=bind,source="$(pwd)"/thrall/docker-conf/etc/gu,target=/etc/gu --mount type=bind,source="$(pwd)"/thrall/docker-conf/etc/grid,target=/etc/grid thrall:0.1
```

Gets as far as trying to connect to Elasticsearch
