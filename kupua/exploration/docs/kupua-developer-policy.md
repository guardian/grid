# Kupua Developer Policy

> Reference for the Janus Developer Policy that scopes AWS credentials for
> kupua local development (and Grid `--use-TEST` running alongside).

## Context

The `media-service` Janus profile gives broad account access. This Developer
Policy provides a much tighter credential set covering only what kupua and
Grid's `sbt runMinimal` (media-api + auth + kahuna) need in `--use-TEST` mode.

**Safety gains over the broad credential:**

- Cannot tunnel to PROD ES (SSM tag condition restricts to TEST)
- Cannot write to instances arbitrarily (ssm-scala uses RunShellScript only to install a temp SSH key; no interactive shell)
- Cannot write to S3 (no PutObject/DeleteObject)
- Cannot invoke arbitrary Bedrock models (only Cohere Embed V4)

## Grant ID

`run-grid-locally`

## Permission summary

| # | Action | Resource | Purpose |
|---|---|---|---|
| 1 | `s3:GetObject` | ThumbBucket/* | Kupua thumbnail proxy + media-api URL signing |
| 2 | `s3:GetObject` | ImageBucket/* | Kupua imgproxy + media-api URL signing/downloads |
| 3 | `s3:GetObject` | `grid-conf/TEST/*` | Grid start.sh config download + runtime config |
| 4 | `s3:GetObject` | ConfigBucket/* | Media-api quota store (runtime reads) |
| 5 | `s3:GetObject` | `pan-domain-auth-settings/local.dev-gutools.co.uk.settings`, `.../local.dev-gutools.co.uk.settings.public`, `.../*.p12` | Media-api panda cookie validation (scoped to local dev domain) |
| 6 | `s3:GetObject` | KeyBucket/* | Media-api API key store |
| 7 | `s3:ListBucket` | KeyBucket | Media-api list API keys |
| 8 | `s3:GetObject` | UsageMailBucket/* | Media-api usage quota store |
| 9 | `s3:ListBucket` | UsageMailBucket | Media-api list usage emails |
| 10 | `s3:GetObject` | `permissions-cache/CODE/*` | Guardian permissions system (hardcoded to CODE stage) |
| 11 | `ec2:DescribeInstances`, `ec2:DescribeTags` | * | Instance discovery (tunnel target) |
| 12 | `ec2:CreateTags` | TEST ES instances (tag-scoped) | ssm-scala marks instances as "tainted" |
| 13 | `ssm:SendCommand` | TEST ES instances (tag-scoped) + `AWS-RunShellScript` doc | ssm-scala installs temp SSH public key |
| 14 | `ssm:GetCommandInvocation` | * | ssm-scala polls until key install completes |
| 15 | `ssm:StartSession` | TEST ES instances (tag-scoped) + `AWS-StartSSHSession` + `AWS-StartPortForwardingRemoteHost` docs | SSH tunnel for ES access |
| 16 | `bedrock:InvokeModel` | Cohere Embed V4 inference profile | AI search embeddings |
| 17 | `cloudwatch:PutMetricData` | * | Grid metrics + future kupua metrics |
| 18 | `dynamodb:GetItem` | SoftDeletedMetadataTable | Media-api soft-delete status check on image GET |

## Stage scoping

- Policy is created only in the TEST stack (`Condition: IsTEST`)
- SSM SendCommand/StartSession on instances scoped by tags:
  `App=elasticsearch-data`, `Stack=media-service`, `Stage=TEST`
- SSM documents allowed: `AWS-RunShellScript` (key install), `AWS-StartSSHSession`, `AWS-StartPortForwardingRemoteHost`
- EC2 CreateTags scoped to same tag set (ssm-scala tainted marker)

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
- **Image deletion / undelete** → the DELETE returns 202 and the Kinesis message is sent, but TEST Thrall's processing of local-origin messages is unreliable. Treat deletes as best-effort when running locally.
  If local Thrall is ever fixed, restore these three statements to the policy (removed in ed31839):
  ```yaml
  # DynamoDB: soft-delete writes
  - Effect: Allow
    Action:
      - dynamodb:PutItem
      - dynamodb:UpdateItem
    Resource: !Sub 'arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${SoftDeletedMetadataTable}'
  # Kinesis: publish delete/undelete message to Thrall
  - Effect: Allow
    Action:
      - kinesis:PutRecord
      - kinesis:PutRecords
    Resource: !GetAtt ThrallMessageQueue.StreamArn
  # KMS: encrypt Kinesis message (stream is KMS-encrypted)
  - Effect: Allow
    Action: kms:GenerateDataKey
    Resource: !GetAtt KmsKeyThrallKinesisStreams.Arn
  ```

**Things that won't start (because not in `runMinimal`):**
- Image upload (image-loader) — not started by `sbt runMinimal`
- Local metadata-editor — not started; edits go to TEST service instead

## CloudFormation location

`editorial-tools-platform/cloudformation/media-service-account/grid/media-service.yaml`
(resource: `RunGridLocally`)

## Janus definition (separate PR)

In `guData/src/main/scala/com/gu/janus/data/DeveloperPolicyGrants.scala`:
```scala
val mediaServiceGrid = DeveloperPolicyGrant(
  id = "run-grid-locally",
  name = "Run Grid locally"
)
```

Grant in `Access.scala` to the relevant user(s).

## Write operations

This policy is effectively read-only. The only AWS write calls media-api makes
that touch local code are:

- `DELETE /images/:id` → DynamoDB PutItem (soft-delete record) + Kinesis PutRecord (Thrall message)
- `PUT /images/:id/undelete` → DynamoDB UpdateItem + Kinesis PutRecord

These write permissions are **not included** in the policy (Kinesis and DynamoDB writes
were removed after confirming deletes don't work reliably with `--use-TEST` even with
full credentials — it's a TEST Thrall issue, not a policy issue).

All other writes in Grid (metadata edits, crops, leases, collections, usage)
are performed by their respective services running on TEST — the browser
follows HATEOAS links directly to those services, bypassing local media-api.
Upload goes via TEST image-loader (HTTP). ELK logging via Kinesis is disabled
in dev mode. SQS embedder queue is only written to by image-loader.
