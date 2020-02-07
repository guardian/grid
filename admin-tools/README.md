# admin tools api

## indexed Image projection

    GET /images/:id/project

### Example

https://admin-tools.media.local.dev-gutools.co.uk/images/7b749a7acbd19590af928243f701e3929adef11e/project

See the [routes file](https://github.com/guardian/media-service/blob/master/admin-tools/conf/routes) for more API
"documentation".

- this project can be run locally as Play APP
- in PROD and TEST it si running as Lambda function

### Build artifact for lambda

`sbt admin-tools-lambda/assembly`

## indexer local run

`export AWS_CBOR_DISABLE=true`
`sbt "project admin-tools-dev" "runMain com.gu.mediaservice.BatchIndexLocalHandler"`
