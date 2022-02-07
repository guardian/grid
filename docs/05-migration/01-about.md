# Migration

Sometimes also described as reindexing or reingestion.

Image migration is an optional process in the Grid that will create a new index
in the Elasticsearch cluster containing an up-to-date representation of all
known images. Unlike the [Elasticsearch Reindex API][es-reindex] (i.e. copying
all documents to a new index using the latest version of the mapping) the
migration process rebuilds the document from the original image metadata (in
S3) AND the user metadata (in DynamoDB) and NOT from the existing ES
representation. Migration also contains improvements to ensure a seamless
transition and improved metadata.

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

### High level

While a migration is [in progress](#migration-status-flag), Thrall will
repeatedly query Elasticsearch for images which have [not yet been
migrated](#image-migration-record). Each image ID which is found will be
[projected](#projection), and that projection will be entered into a low
priority queue for processing by Thrall when no other updates need to be
processed.  All other interactions, such as uploads and edits --- both automated
and user-driven --- go onto higher priority queues, which means that they should
not be delayed by migration. When ready, Thrall processes the message by
checking that there have been no updates to the image since the projection was
taken, then inserting the projection into the migration index. While this
processing does technically block new messages arriving on the higher priority
queues, the projection has already been computed before entering the queue, so
the only processing remaining is to insert the document into the migration index
which usually completes in under 30ms, meaning that in practice blocking is
minimal.

Any uploads or edits performed during the migration will be performed on both
the source and target indices concurrently. This allows Grid to continue running
seamlessly throughout the process, and the migration can be abandoned at any
point if required.

### Projection

Projection is the term used to describe the process by which we reconstruct our
representation of an image's metadata from the primary data sources (the
original image and user edits stored in DynamoDB). The projection does not
source _any_ data from the 'old' Elasticsearch index. The projection can be
described roughly as how the image would be stored if it had been uploaded and
edited using the current code.

### Migration status flag

The Grid will track the status of migration by observing the aliases present on
the Elasticsearch cluster.

- "Images_Current": There should always be exactly one index with this alias.
  This index will be used as the source for the migration.
- "Images_Migration": If this alias has been assigned to an index, a migration
  is in progress. The assigned index will be used as the target for migration.
  NOTE: **do not assign Images_Current and Images_Migration to the same index**
- "Images_Historical": When a migration has been completed, this alias will be
  assigned to the index previously assigned "Images_Current". This alias powers
  the functionality to [view errors from a previous
  migration](./02-how-to.md#troubleshooting).
  NOTE: **do not assign Images_Historical and Images_Current to the same index**
- "MIGRATION_PAUSED": If this alias has been assigned to the same index as
  "Images_Migration", then Thrall will not queue images for migration. Images
  can still be [manually queued for migration](./02-how-to.md#running).

### Image migration record

We store the success or failure of migrating the image in the 'old'
Elasticsearch index. This allows us to quickly query for IDs to migrate by
using the existing index. This can be found at `esInfo.migration`. Failures will
be stored with the exception message, although more detailed information will be
available in the application logs.

[es-reindex]: https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-reindex.html
