# Image reingestion

Occasionally, you may want to run images through the ingestion pipeline again, for example to establish new mappings, or restore missing data in Elasticsearch.

The tooling for this operation is semi-automated, but some manual steps are still necessary to reingest images at present. The relevant scripts are available in `scripts/reindex-images`.

## How does the reingestion process work?

The reingestion process is made up of a series of lambdas that manage the reingestion, and a dynamoDB table to track the progress of images through the process. The relevant infrastructure is created as part of the `admin-tools` stack. There are three steps –

1. Add the image ids to the dynamo table – the ids of the images to be reingested are added to the dynamoDB table and marked as ready.
2. Reingest the images – the reingestion lambda is repeatedly invoked, working through the ids in the table until all of the images in the table are no longer in the ready state.
3. Check the images are now present in the Grid – the reingestion checker lambda is repeatedly invoked, checking that images that have been marked as reingested are now present in the Grid.

## 1. Add the ids to the dynamo table

The name of the dynamo table is referenced in the batch index lambda with the param `IMAGES_TO_INDEX_DYNAMO_TABLE`.

To upload ids to the table, run `node scripts/reindex-images/upload-ids-to-dynamo.js`. Running this script without arguments will give usage details. This will require `node`, which should have been installed as part of the grid setup process.

## 2. Reingest the images

Once the image ids are available in dynamoDB, to begin reingestion, turn the EventBridge source for the image reingestion lambda on. At the time of writing, this lambda is called `admin-tools-image-batch-index-lambda-{STAGE}`.

This lambda –

- finds each image by its ID in the S3 bucket containing
-
-

The images are processed on `admin-tools`-specific `image-loader` boxes, and the reingestion messages are sent to the low-priority queue, so reingestion should not affect the performance of PROD.

You can check the progress of the reingestion in [the metrics tool](). Once all images have been reingested, the activity on the lambda should cease.

Once there are no more images to process, we'd expect most images to be in the

If you'd like a full description of the current table state,the script `scan-dynamo-table-for-image-statuses.js` will dump the current state of the reingestion table into a file for inspection.

Don't forget to turn off the EventBridge source once this process is complete!

## 3. Check the images are now present in the Grid

As with step 3., to run the image checker lambda, turn the EventBridge source for the lambda on. At the time of writing, this lambda is called `admin-tools-image-batch-check-lambda-{STAGE}`.

You should be able to see the checking process in the metrics tool as before.

@todo

- Add notes on how to tweak settings to adjust e.g. throughput
- Add example of how to get current state of reingestion bucket via script
- Add notes on different states
- Add wishlist for future infra work to improve this process?
