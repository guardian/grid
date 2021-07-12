# Migration to Elasticsearch 6

The Grid uses Elasticsearch to persist and search image metadata.

The original release of the Grid used Elasticsearch 1.7 over the TCP interface.
This version is no longer supported by Elastic meaning we need to migrate to a more recent version.

We've chosen to migrate to Elasticsearch 6.5 (specify we're testing against 6.5.4).
The move to version 6 also involves a move from the TCP to HTTP interface.
This should allow the Grid to be used with managed instances of Elasticsearch.


## Affected components

The media-api and thrall components have dependencies on Elasticsearch.

## Opting in

The master branch now contains Elasticsearch 1.7 and 6.5 compatible code.
Version 6 indexes are currently behind a feature toggle. It's envisioned that
in the near future Elastic 6 will become the default and that the Elastic 1.7 code will be removed.

To enable Elasticsearch 6 the following es6.* config elements should be included.
To turn off Elastic 1.7 the es.* config elements should be removed, with the exception of the aliases.


### Common

```
es.index.aliases.current=Images_Current
es.index.aliases.migration=Images_Migration

es6.url=http://elastic6.local:9200
es6.cluster=media-service
es6.shards=5
es6.replicas=2
```


## Migration of data from Elasticsearch 1.7

If you have an existing Elasticsearch 1.7 install of the Grid, you will need to migrate the contents of
your 1.7 indexes into 6.5. A [command line tool](../migration) has been developed to perform this one off migration.


## Work in progress warning

The Elastic 6 indexes are currently a work in progress. Ongoing testing may reveal the need for a breaking change to the version 6 index mappings.
In this situation the contents of the Elastic 6 index will need to be dropped. Elastic 6 should not be considered for a master copy of your
image data at this point; stick with Elastic 1.7 and migrate at a latter date if this concerns you.
