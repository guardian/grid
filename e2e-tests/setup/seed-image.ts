/**
 * Disposable copies of the seeded image fixtures, for scenarios that change an image.
 *
 * Each copy gets a unique id and is indexed straight into Elasticsearch, so scenarios that
 * save edits never touch the shared fixtures or each other, including under parallel runs
 * and retries. The copy reuses the source fixture's asset paths (seed-image-files.ts uploads
 * those to S3), so it renders without uploading any image bytes.
 */
import { randomBytes } from 'node:crypto';
import { DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { ELASTICSEARCH_PORT, LOCALSTACK_PORT } from './constants.ts';
import type { ImageSource } from './image-fixtures.ts';
import { provisioningClients } from './provision.ts';

const IMAGES_ALIAS = 'Images_Current';
const EDITS_TABLE = 'EditsTable';

const documentUrl = (id: string) =>
  `http://localhost:${ELASTICSEARCH_PORT}/${IMAGES_ALIAS}/_doc/${id}`;

/**
 * Index a copy of `source` (e.g. a fixture from `findSeededImage`), with `overrides` replacing
 * top-level fields (e.g. `usageRights`), and return its id. Searchable once this resolves.
 * The copy starts with no leases, collections, exports, usages or edits.
 */
export async function indexImageCopy(
  source: ImageSource,
  overrides: Partial<ImageSource> = {},
): Promise<string> {
  // Media ids are SHA-1 hex digests, so keep the copy's id the same shape.
  const id = randomBytes(20).toString('hex');
  const image: ImageSource = {
    ...structuredClone(source),
    id,
    leases: { leases: [], lastModified: null },
    collections: [],
    exports: [],
    usages: [],
    ...structuredClone(overrides),
  };
  // Edits belong to the metadata editor's record for this id, which starts out empty.
  delete image.userMetadata;
  delete image.userMetadataLastModified;

  const response = await fetch(`${documentUrl(id)}?op_type=create&refresh=wait_for`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(image),
  });
  if (response.status !== 201) {
    throw new Error(`Indexing image copy ${id} failed: HTTP ${response.status} ${await response.text()}`);
  }
  return id;
}

/**
 * Delete image copies and any edits the metadata editor stored for them. Only for ids from
 * `indexImageCopy`: the copies share their assets with the fixtures, so the Grid's own image
 * deletion must not be used. Thrall updates edits without upserting, so a late update cannot
 * bring a deleted copy back.
 */
export async function deleteImageCopies(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { dynamo } = provisioningClients(`http://localhost:${LOCALSTACK_PORT}`);
  try {
    const results = await Promise.allSettled(
      ids.flatMap((id) => [
        (async () => {
          const response = await fetch(`${documentUrl(id)}?refresh=wait_for`, { method: 'DELETE' });
          if (response.status !== 200 && response.status !== 404) {
            throw new Error(`Deleting image copy ${id} failed: HTTP ${response.status} ${await response.text()}`);
          }
        })(),
        dynamo.send(new DeleteItemCommand({ TableName: EDITS_TABLE, Key: { id: { S: id } } })),
      ]),
    );
    const failures = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
    if (failures.length > 0) {
      throw new AggregateError(failures, `Cleaning up image copies ${ids.join(', ')} failed`);
    }
  } finally {
    dynamo.destroy();
  }
}
