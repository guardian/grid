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
| fromDate   | Search images uploaded since this time    | [no lower bound]
| toDate     | Search images uploaded before this time   | [no upper bound]

Date-time values (e.g. fromDate) can be provided in ISO format (no milliseconds), e.g. `2013-10-24T11:09:38Z` (i.e.
the same format as date-times in the documents). They can also be provided as relative durations, e.g. `7.days`.

### Example

http://media-ser-mediaapi-1uzj4tw8g9lmy-1465883965.eu-west-1.elb.amazonaws.com/images?q=horse&fromDate=2.weeks

See the [routes file](https://github.com/guardian/media-service/blob/master/media-api/conf/routes) for more API
"documentation".
