# Reaper Lambda

This is a service responsible for deleting old images from the Grid. It is run by the aws lambda `reaper-lambda-function-{stage}` in the media-service account which runs on a scheduled basis.
The CredentialsConfig module fetches the config settings from the s3 bucket {stage}/reaper/conf.json in media-service.

The number of pictures to delete and the span of time are set as query params in `index.js`. The frequency of exectution is set in the aws console.

### Cloudformation

See [this PR](https://github.com/guardian/grid-infra/pull/306) for the template changes needed to add the lambda to the cloudformation. If changes to the template are made, the new template will need to be uploaded manually to aws for both TEST and PROD environments.

### Deploying the service

This needs to be deployed as a standalone service in Riff Raff, by selecting the project `media-service::grid::reaper-lambda` and the appropriate stage.
The package `node-riffraff-artefact` is responsible for building the Riff Raff artifact.

### Logs

Logs are sent to cloudwatch, which can then be shipped to ELK using [cloudwatch logs management](https://github.com/guardian/cloudwatch-logs-management)
