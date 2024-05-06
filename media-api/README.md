# media-api

## Image search

    GET /images

### Optional query string parameters

| Key        | Description                               | Default          |
|------------|-------------------------------------------|------------------|
| q          | Text search query                         | [empty]
| offset     | Start offset for results                  | 0
| length     | Maximum number of results                 | 10
| orderBy    | Field for ordering (prepend '-' for DESC) | -uploadTime
| since      | Search images uploaded since this time    | [no lower bound]
| until      | Search images uploaded before this time   | [no upper bound]

Date-time values (e.g. since) can be provided in ISO format (no milliseconds), e.g. `2013-10-24T11:09:38Z` (i.e.
the same format as date-times in the documents). They can also be provided as relative durations, e.g. `7.days`.

### Example

http://media-ser-mediaapi-1uzj4tw8g9lmy-1465883965.eu-west-1.elb.amazonaws.com/images?q=horse&since=2.weeks

See the [routes file](https://github.com/guardian/media-service/blob/master/media-api/conf/routes) for more API
"documentation".



## Start up

### Mandatory usage quota config

Fails hard with an S3 error if the usage quota config JSON file is not available.

`com.amazonaws.services.s3.model.AmazonS3Exception: The specified key does not exist. (Service: Amazon S3; Status Code: 404'

```
at lib.QuotaStore.fetchQuota(UsageStore.scala:207)
at lib.QuotaStore.update(UsageStore.scala:202)
at MediaApiComponents.<init>(MediaApiComponents.scala:25)
```

Needs at least an empty JSON array in a file in a bucket:

```
s3.config.bucket=
quota.store.key=
```


### Mandatory usage mail config

```
s3.usagemail.bucket=
```

Seems to be the backing bucket for usage store. Do not know what the email reference means though!
Media API seems like a read only user of this bucket.

