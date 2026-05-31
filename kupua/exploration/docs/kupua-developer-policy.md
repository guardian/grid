# Kupua Developer Policy

> Reference for the Janus Developer Policy that scopes AWS credentials for
> kupua local development (and Grid `--use-TEST` running alongside).

## Context

The `media-service` Janus profile gives broad account access. This Developer
Policy provides a much tighter credential set covering only what kupua and
Grid's `sbt runMinimal` (media-api + auth + kahuna) need in `--use-TEST` mode.

**Safety gains over the broad credential:**

- Cannot tunnel to PROD ES (SSM tag condition restricts to TEST)
- Cannot SSH/run commands on instances (only port-forwarding document allowed)
- Cannot write to S3 (no PutObject/DeleteObject)
- Cannot invoke arbitrary Bedrock models (only Cohere Embed V4)

## Grant ID

`run-kupua-and-media-api-locally`

## Permission summary

| # | Action | Resource | Purpose |
|---|---|---|---|
| 1 | `s3:GetObject` | ThumbBucket/* | Kupua thumbnail proxy + media-api URL signing |
| 2 | `s3:GetObject` | ImageBucket/* | Kupua imgproxy + media-api URL signing/downloads |
| 3 | `s3:GetObject` | `grid-conf/TEST/*` | Grid start.sh config download + runtime config |
| 4 | `s3:GetObject` | ConfigBucket/* | Media-api quota store (runtime reads) |
| 5 | `s3:GetObject` | `pan-domain-auth-settings/*` | Media-api panda cookie validation |
| 6 | `s3:GetObject` | KeyBucket/* | Media-api API key store |
| 7 | `s3:ListBucket` | KeyBucket | Media-api list API keys |
| 8 | `s3:GetObject` | UsageMailBucket/* | Media-api usage quota store |
| 9 | `s3:ListBucket` | UsageMailBucket | Media-api list usage emails |
| 10 | `s3:GetObject` | `permissions-cache/TEST/*` | Guardian permissions system |
| 11 | `ec2:DescribeInstances`, `ec2:DescribeTags` | * | Instance discovery (tunnel target) |
| 12 | `ssm:StartSession` | TEST ES instances (tag-scoped) | SSH tunnel for ES access |
| 13 | `bedrock:InvokeModel` | Cohere Embed V4 inference profile | AI search embeddings |
| 14 | `cloudwatch:PutMetricData` | * | Grid metrics + future kupua metrics |
| 15 | `dynamodb:GetItem`, `PutItem`, `UpdateItem` | SoftDeletedMetadataTable | Media-api soft-delete status (read + write) |
| 16 | `kinesis:PutRecord`, `PutRecords` | ThrallMessageQueue | Delete/undelete publishes to Thrall |
| 17 | `kms:GenerateDataKey` | KmsKeyThrallKinesisStreams | Kinesis stream is KMS-encrypted |

## Stage scoping

- Policy is created only in the TEST stack (`Condition: IsTEST`)
- SSM StartSession additionally scoped by instance tags:
  `App=elasticsearch-data`, `Stack=media-service`, `Stage=TEST`
- SSM document restricted to `AWS-StartPortForwardingRemoteHost` (no shell)

## Usage

No script changes needed. Both apps already read the `media-service` profile:

- **Kupua:** `kupua/scripts/start.sh --use-TEST`
- **Grid:** `dev/script/start.sh --use-TEST`

In Janus, select "Run kupua and media-api locally (read-only)" instead of
"Developer" under the media-service account. Credentials export to the same `--profile media-service`
slot — the scoping comes from the assumed IAM role, not the profile name.

## What breaks if you use this credential

**Nothing.** Grid's HATEOAS architecture means most write operations
don't touch local media-api at all:

- **Metadata edits** (title, description, rights, labels) → work fine. The
  browser follows the `"edits"` link directly to TEST metadata-editor, which
  has its own full credentials. Local media-api just serves the link URL.
- **Crops, leases, usages** → same pattern. Browser talks directly to TEST
  cropper/leases/usage services via HATEOAS links.
- **Image search, detail, downloads, URL signing** → all GET, all work.
- **Image deletion / undelete** → works. The policy includes Kinesis and
  DynamoDB write permissions for the soft-delete path.

**Things that won't start (because not in `runMinimal`):**
- Image upload (image-loader) — not started by `sbt runMinimal`
- Local metadata-editor — not started; edits go to TEST service instead

## CloudFormation location

`editorial-tools-platform/cloudformation/media-service-account/grid/media-service.yaml`
(resource: `RunKupuaAndMediaApiLocally`)

## Janus definition (separate PR)

In `guData/src/main/scala/com/gu/janus/data/DeveloperPolicyGrants.scala`:
```scala
val runKupuaAndMediaApiLocally = DeveloperPolicyGrant(
  id = "run-kupua-and-media-api-locally",
  name = "Run kupua and media-api locally (read-only)"
)
```

Grant in `Access.scala` to the relevant user(s).

## Write operations: why this is the complete set

Delete/undelete is the **only** non-read-only operation media-api performs
that we can control via this Developer Policy. Specifically:

- `DELETE /images/:id` → `SoftDeletedMetadataTable.setStatus` (DynamoDB PutItem) +
  `ThrallMessageSender.publish` (Kinesis PutRecord, KMS-encrypted)
- `PUT /images/:id/undelete` → `SoftDeletedMetadataTable.updateStatus` (DynamoDB UpdateItem) +
  `ThrallMessageSender.publish` (Kinesis PutRecord, KMS-encrypted)

All other writes in Grid (metadata edits, crops, leases, collections, usage)
are performed by their respective services running on TEST — the browser
follows HATEOAS links directly to those services, bypassing local media-api.
Upload goes via TEST image-loader (HTTP). ELK logging via Kinesis is disabled
in dev mode. SQS embedder queue is only written to by image-loader.
