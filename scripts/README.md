# Scripts

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


### UpdateSettings
When you need to close the index to update the settings i.e. when you have to add / reconfigure
analysers - this is the command you can use.

This is a multi-step process:
* It is very important that you [pause thrall's ingestion first]() by running:
    ```
    $ /thrall-pause/stop.sh
    $ ./stop.sh <ENV>
    ```

* Update the settings
    ```
    > scripts/run UpdateSettings <ENV>
    ```

* Unpause thrall
    ```
    $ /thrall-pause/start.sh
    ```
