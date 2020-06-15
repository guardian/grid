# Image reingestion

Occasionally, you may want to run images through the ingestion pipeline again, for example to establish new mappings, or restore missing data in Elasticsearch.

The tooling for this operation is semi-automated, but some manual steps are still necessary to reingest images at present. The relevant scripts are available in `scripts/reindex-images`.

## How does the reingestion process work?

The reingestion process is made up of a series of lambdas that manage the reingestion, and a dynamoDB table to track the progress of images through the process. The relevant infrastructure is created as part of the `admin-tools` stack. There are four steps –

1. Install the dependencies in the scripts folder.
2. Add the image ids to the dynamo table.
3. Reingest the images.
4. Check the images are now present in the Grid.

### 1. Install dependencies

This will require `node`, which should have been installed as part of the grid setup process.

1. `cd scripts/reindex-images/`
1. `npm install`

### 2. Add the ids to the dynamo table

The name of the dynamo table is referenced in the batch index lambda with the param `IMAGES_TO_INDEX_DYNAMO_TABLE`.

To upload ids to the table, run `node scripts/reindex-images/upload-ids-to-dynamo.js`. Running this script without arguments will give usage details.

### 3. Reingest the images

Once the image ids are available in dynamoDB, to begin reingestion, turn the EventBridge source for the image reingestion lambda on. At the time of writing, this lambda is called `admin-tools-image-batch-index-lambda-{STAGE}`, where `STAGE` is TEST or PROD.

This can be done for TEST [here](https://eu-west-1.console.aws.amazon.com/lambda/home?region=eu-west-1#/functions/admin-tools-image-batch-index-lambda-TEST?tab=configuration)
and for PROD [here](https://eu-west-1.console.aws.amazon.com/lambda/home?region=eu-west-1#/functions/admin-tools-image-batch-index-lambda-PROD?tab=configuration).  You will need
to acquire credentials through Janus.

The reindex lambda will then be repeatedly invoked by the EventBridge expression, carrying out the following operations in batches –

- Call the `image-projection` lambda, which
  - Asks the `image-loader` service for its image
  - If the image is present, gathers any information the Grid data services contain about it – usages, collection data, leases, and crops – merges that data with the response from `image-loader`, and returns the lot as an `Image`
- Issue a `reingest-image` message with the returned `Image`, which is posted on the low-priority `thrall` queue.

The images are processed on `admin-tools`-specific `image-loader` boxes, and the reingestion messages are sent to the low-priority queue, so reingestion should not affect the performance of PROD.

You can check the progress of the reingestion in [the metrics tool](https://metrics.gutools.co.uk/d/U7pixN_Zk/media-service-image-reingestion?orgId=1). Once all images have been reingested, the activity on the lambda should cease.

Once there are no more images to process, we'd expect most images to be in the `enqueued` state – see the [states](#states) section below for details.

If you'd like a full description of the current table state,the script `scan-dynamo-table-for-image-statuses.js` will dump the current state of the reingestion table into a file for inspection. Running the script without arguments should document its usage.

Don't forget to turn off the EventBridge source once this process is complete!

### 4. Check the images are now present in the Grid

At the end of step 2., every image that has been succesfully processed should have been added to the `thrall` queue as a `reingest-image` message. There's no guarantee, however, that these messages have been processed. This step checks that the images marked as submitted have been processed successfully.

As with step 3., to run the image checker lambda, turn the EventBridge source for the lambda on and wait until the lambda has exhausted its source of images. At the time of writing, this lambda is called `admin-tools-image-batch-check-lambda-{STAGE}`.

You should be able to see the checking process in the metrics tool as before.

## How to tweak settings to adjust e.g. throughput

See environment variables on the lambda, which should document themselves.

## States

Each image has a self-documenting state on its entry in dynamo.
Note that state 6 - Verified - is the intended success state.

See ./admin-tools/lib/src/main/scala/com/gu/mediaservice/indexing/IndexInputCreation.scala

## Wishlist (future development)

- It would be useful to automate more of this process, especially if we would like to use this workflow for periodic reindexes.
- It would be cleaner/safer if the event bridge was turned off by the lambda at completion.
