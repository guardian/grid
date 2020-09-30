import { IngestConfig } from "../lib/Lambda";

export const ingestConfig: IngestConfig = {
  region: 'eu-west-1',
  baseUrl: 'https://grid.example.net',
  apiKey: 'top-secret',
  failBucket: 'grid-failure-bucket',
  s3UrlExpiry: 60,
  stage: 'TEST'
}