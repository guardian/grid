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

Fails immediately while apparently trying to start functional test Docker dependencies from test code.
Move these dependencies to a start off docker-compose for an easier build.


## Packaging

The Guardian build.sbt no longer mentions riffraff.

They seem to be using JDebPackaging which is probably a wrapper around universal.

sbt docker is also a wrapper around universal so this probably makes things easier for us.

sbt dist and examining the contents of the .zip file seems to reflect the contents of the container image.

```
sbt thrall/docker:publishLocal
docker run -it thrall:0.1
```

Fails with missing application level config; this is encoraging:
`java.lang.RuntimeException: Required string configuration property missing: thrall.kinesis.stream.name`


