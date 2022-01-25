# How to run a migration

Migrations are primarily controlled from the Thrall dashboard, an HTTP page
exposed by Thrall.

## Preparation

Running a migration requires a lot of computation - each image in your library
must be projected, which involves downloading and reprocessing the original
image from scratch. For this reason, we suggest running a second pool of
image-loader instances reserved specifically for projection. These are usually
hosted at the `loader-projection.media.` domain prefix, though you can of course
reuse your primary pool of image-loader instances by setting the
`hosts.projectionPrefix` configuration option to the same value as the
`hosts.loaderPrefix` option (defaults to `loader.media.`). Be aware though that
doing so may cause slowdown or disruption to users uploading images. Take care
to scale whichever pool of image-loader instances to an appropriate size.

<!-- TODO offer a config option to tune Thrall's parallelism of projection
requests? Currently hardcoded to 50, we used 6x m5.large in first migration -->

You will also experience an increased usage of your DynamoDB tables and
Elasticsearch cluster, so make sure to watch their performance and scale both to
match their usage.

## Starting

A migration can be started by going to the Thrall dashboard and following the
prompt to press the 'Start Migration' button. This will create a new index using
the latest version of the mappings (see
[Mappings.scala](../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala))
and then
[assign the "Images_Migration" alias](./01-about.md#migration-status-flag).
Thrall will then automatically begin searching for and queueing images for
migration.

<!-- TODO screenshot of starting a migration here -->

## Running

While a migration is running, you can track progress on the Thrall dashboard,
which will display a count of images that exist in each index.

## Finishing

## Troubleshooting
