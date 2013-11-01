# media-api

## Image search

    GET /images

### Optional query string parameters

| Key        | Description                                    | Default         |
|------------|------------------------------------------------|-----------------|
| q          | Text search query                              | [empty]
| page       | Page in results (1-based)                      | 1
| size       | Results per page                               | 10
| order-by   | Field used for ordering (prepend '-' for DESC) | -uploaded-time
| from-date  | Search only images uploaded since this time    | [no lower bound]
| to-date    | Search only images uploaded before this time   | [no upper bound]
| bucket     | Search in these buckets (comma-separated)      | [all buckets]

### Example

http://media-ser-mediaapi-1uzj4tw8g9lmy-1465883965.eu-west-1.elb.amazonaws.com/images?q=horse

See the [routes file](https://github.com/guardian/media-service/blob/master/media-api/conf/routes) for more API
"documentation".
