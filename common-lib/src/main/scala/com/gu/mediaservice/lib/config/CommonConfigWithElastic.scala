package com.gu.mediaservice.lib.config

import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchAliases, ElasticSearchConfig}

class CommonConfigWithElastic(resources: GridConfigResources) extends CommonConfig(resources) {

  val esConfig = ElasticSearchConfig(
    aliases = ElasticSearchAliases(
      current = string("es.index.aliases.current"),
      migration = string("es.index.aliases.migration")
    ),
    url = string("es6.url"),
    shards = string("es6.shards").toInt,
    replicas = string("es6.replicas").toInt
  )

  // note this will match any part of the collection path, e.g. "bar" will match "bar", "foo/bar", "bar/baz"
  val maybePersistOnlyTheseCollections: Option[Set[String]] = getOptionalStringSet("persistence.onlyTheseCollections")
}
