# Reaper Lambda

This is a service responsible for deleting old images from the Grid and is designed to run on a [frequent] schedule and each invocation...
- soft delete a batch of images which are `is:reapable` (see https://github.com/guardian/grid/pull/3926)
- hard delete a batch of images which are `is:reapable` AND have been 'soft deleted' for 2 weeks or more
...logging the above and storing a permanent record to dedicated (& stage specific) S3 bucket.

### Infra (CDK)

This lambda (and its bucket) forms part of `grid-extras` stack defined in the [`cdk`](../cdk) directory.

### Deploying the service

This lambda is part of the `grid-extras` collection of things and can be deployed via riff-raff under `media-service::grid::extras` and the appropriate stage.

### Logs

Logs are sent to cloudwatch, which can then be shipped to ELK using [cloudwatch logs management](https://github.com/guardian/cloudwatch-logs-management)
