# Image Lambda

This is a service responsible for getting the total image count from the Grid and sending them to CloudWatch.

It queries the `/management/imageCounts` endpoint of the Media API to fetch the following counts:
```typescript
{
  catCount: number;
  searchResponseCount: number;
  indexStatsCount: number;
}
```

### Deploying the service

This needs to be deployed as a standalone service in Riff Raff, by selecting the project `media-service::grid::image-counter-lambda` and the appropriate stage.
The package `node-riffraff-artefact` is responsible for building the Riff Raff artifact.

### Logs

Logs are sent to cloudwatch, which can then be shipped to ELK using [cloudwatch logs management](https://github.com/guardian/cloudwatch-logs-management)
