# Scripts

## Updating a CloudFormation stack

    $ AWS_CREDENTIAL_FILE=~/.aws-credentials sbt
    > scripts/run <CreateStack|UpdateStack> <STAGE> <PANDA_ACCESS_KEY> <PANDA_ACCESS_SECRET> <MIXPANEL_TOKEN>


## Updating Elasticsearch

__TL;DR__ When you update the mapping, use [Reindex](#Reindex),
when you add a mapping, use [UpdateMapping](#UpdateMapping)

### Reindex
On occasion you will need to update the our [Elasticsearch mappings](https://github.com/guardian/media-service/blob/master/common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala).
Unfortunately, you need to change the mapping and then reindex the data to apply said change.
[Read more about the inspiration](http://www.elasticsearch.org/blog/changing-mapping-with-zero-downtime/)

    $ sbt
    > scripts/run Reindex <ES_HOST>

### UpdateMapping
When you add a mapping e.g. You add a new field to the [image mapping](https://github.com/guardian/media-service/blob/master/common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala#L73)
you should add the mapping with this script as we are using [`strict`](http://www.elasticsearch.org/guide/en/elasticsearch/guide/current/dynamic-mapping.html)
mappings (you cannot just add things willy nilly).

    $ sbt
    > scripts/run UpdateMapping <ES_HOST>
