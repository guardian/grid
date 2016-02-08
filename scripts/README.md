# Scripts

## Updating Elasticsearch

__TL;DR__ When you update the mapping, use [Reindex](#Reindex),
when you add a mapping, use [UpdateMapping](#UpdateMapping)

### Reindex
On occasion you will need to update the our [Elasticsearch mappings](https://github.com/guardian/grid/blob/master/common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala).
Unfortunately, you need to change the mapping and then reindex the data to apply said change.
[Read more about the inspiration](http://www.elasticsearch.org/blog/changing-mapping-with-zero-downtime/)

    $ sbt
    > scripts/run Reindex <ES_HOST>

Optionally takes a DateTime string as a second argument. Will perform reindex for documents updated *since the date provieded*

    > scripts/run Reindex <ES_HOST>  016-01-28T10:55:10.232Z


### UpdateMapping
When you add a mapping e.g. You add a new field to the [image mapping](https://github.com/guardian/grid/blob/master/common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala#L73)
you should add the mapping with this script as we are using [`strict`](http://www.elasticsearch.org/guide/en/elasticsearch/guide/current/dynamic-mapping.html)
mappings (you cannot just add things willy nilly).

    $ sbt
    > scripts/run UpdateMapping <ES_HOST>

Optionally takes an index name. e.g.

    > scripts/run UpdateMapping <ES_HOST> images_5

### UpdateSettings
When you need to close the index to update the settings i.e. when you have to add / reconfigure
analysers - this is the command you can use.

__:warning: This should only EVER be run on your local version. :warning:__

    ```
    $ # after pausing thrall
    $ sbt
    > scripts/run UpdateSettings localhost
    ```
