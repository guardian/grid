# Image cache purger

A JVM AWS Lambda responsible for purging cached Grid images.

The Lambda entry point is:

```text
com.gu.mediaservice.ImageCachePurger::handleRequest
```

## Test

```bash
sbt 'image-cache-purger/test'
```

## Build the deployment artifact

```bash
sbt 'image-cache-purger/assembly'
```

This creates `image-cache-purger/target/scala-2.13/image-cache-purger.jar`.

