# Migration

Sometimes also described as reindexing or reingestion.

Image migration is an optional process in the Grid that will create a new index
in the Elasticsearch cluster containing an up-to-date representation of all
known images. In simple cases, this is akin to the [Elasticsearch Reindex
API][es-reindex], i.e. moving all documents to a new index using the latest
version of the mapping, but migration also contains improvements to ensure a
seamless transition and improved metadata.

## Why

In normal usage, the main reason to run an image migration is to create a fresh
index in the Elasticsearch cluster. Once an index has been created, its mappings
can be extended but not altered. If a change needs to be made, or a new setting
enabled, the entire index must be replaced. For some usages, the [Elasticsearch
Reindex API][es-reindex] will suffice as a system to move the documents into
this new index, but this does not fulfill all of the Grid's requirements.

For example, the Reindex API will take some time to complete. What should happen
to images that receive updates during the process? If the transition to the new
index is carried out naïvely, such updates will be lost. We also wanted a
process that could be reused to restore the cluster in the event of data loss,
and also to reprocess the metadata embedded in each image file, and take
advantage of any improvements made since the first upload.

## How it works

<!--
 - New, self-driven Thrall stream, containing image projections.
 - Image projection endpoint, which performs image ingest but also combining
   with user edits stored in DynamoDB tables.
 - All image operations (uploads, edits, deletions) are operated upon each
   index.
-->

### High level

While a migration is in progress, Thrall will repeatedly query Elasticsearch for
images which have [not yet been migrated](#migration-status-flag). Each image ID
which is found will be [projected](#projection), and that projection will be
entered into a low-priority queue for processing by Thrall when no other updates
need to be processed. When ready, Thrall processes the message by checking that
there have been no updates to the image since the projection was taken, then
inserting the projection into the migration index.

### Projection

Projection is the term used to describe the process by which we reconstruct our
representation of an image's metadata from the primary data sources (the
original image and user edits stored in DynamoDB). The projection does not
source _any_ data from the 'old' Elasticsearch index. The projection can be
described roughly as how the image would be stored if it had been uploaded and
edited using the current code.

### Migration status flag

We store the success or failure of migrating the image in the 'old'
Elasticsearch index. This allows us to quickly query for IDs to migrate by
using the existing index.

[es-reindex]: https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-reindex.html
