# admin tools api

## indexed Image projection

    GET /images/projection/:id

### Example

https://admin-tools.media.local.dev-gutools.co.uk/images/projection/7b749a7acbd19590af928243f701e3929adef11e

See the [routes file](https://github.com/guardian/media-service/blob/master/admin-tools/conf/routes) for more API
"documentation".

- this project can be run locally as Play APP
- in PROD and TEST it si running as Lambda function

### Build artifact for lambda

`sbt admin-tools-lambda/assembly`

## indexer local run

`export AWS_CBOR_DISABLE=true`
`sbt "project admin-tools-lambda" "runMain com.gu.mediaservice.BatchIndexLocalHandler"`
