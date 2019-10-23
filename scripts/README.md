# Scripts

## Updating Elasticsearch

__TL;DR__ When you update the mapping, use [Reindex](#Reindex),
when you add a mapping, use [UpdateMapping](#UpdateMapping)

If using SSH tunnel, and you wish to execute commands via https, you will need to add something like:
```127.0.0.1      es.eu-west-1.es.amazonaws.com``` to your `/private/etc/hosts` file to match the certificate path. Then when issuing the command do
```scripts/run <command> https://es.eu-west-1.es.amazonaws.com:<tunneled_port>```

### Reindex
On occasion you will need to update the our [Elasticsearch mappings](https://github.com/guardian/grid/blob/master/common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala).
Unfortunately, you need to change the mapping and then reindex the data to apply said change.
[Read more about the inspiration](http://www.elasticsearch.org/blog/changing-mapping-with-zero-downtime/)

This performs the following:
1. Creates a new index (with the new mappings) appending a version number to the new index e.g. `images_5`
2. Copies over all data from the original index to the new index using scrolling
3. Points the write alias to the new index
4. Checks if any new data has been wrote since the script started, if so copies this over as well
5. Points the read alias to the new index

```
    $ sbt
    > scripts/run Reindex <ES_URL>
```

Optionally takes a DateTime string argument. Will perform reindex for documents updated *since the date provieded*

    > scripts/run Reindex <ES_URL> FROM_TIME=016-01-28T10:55:10.232Z

Optionally takes a new index name string argument. Will reindex into that new name instead of the default version increment

    > scripts/run Reindex <ES_URL> NEW_INDEX=images

### UpdateMapping
When you add a mapping e.g. You add a new field to the [image mapping](https://github.com/guardian/grid/blob/master/common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala#L73)
you should add the mapping with this script as we are using [`strict`](http://www.elasticsearch.org/guide/en/elasticsearch/guide/current/dynamic-mapping.html)
mappings (you cannot just add things willy nilly). Updating mappings is done in 2 steps:

1. Set up a SSH tunnel to the AWS elasticsearch instance: `ssh -L 9300:localhost:9300 <ES_URL>`

2. Run the script:
```
    $ sbt
    > scripts/run UpdateMapping <ES_URL>
```
    
Optionally takes an index name. e.g. `> scripts/run UpdateMapping <ES_URL> images_5`

To test the connection without making any changes to the mappings, you can run: `sbt scripts/run GetMapping <ES_URL>`.

### UpdateSettings
When you need to close the index to update the settings i.e. when you have to add / reconfigure
analysers - this is the command you can use.

__:warning: This should only EVER be run on your local version. :warning:__

    ```
    $ # after pausing thrall
    $ sbt
    > scripts/run UpdateSettings localhost
    ```
