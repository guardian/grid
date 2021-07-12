package com.gu.mediaservice.lib.config

import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchAliases, ElasticSearchConfig}

class CommonConfigWithElastic(resources: GridConfigResources) extends CommonConfig(resources) {

  val esConfig = ElasticSearchConfig(
    aliases = ElasticSearchAliases(
      // TODO: reinstate this once everyone's config has been updated...
//      current = string("es.index.aliases.current"),
      // TODO: ...and then remove this
      current = stringOpt("es.index.aliases.read") getOrElse stringOpt("es.index.aliases.write")
        .getOrElse(string("es.index.aliases.current")),

      migration = stringOpt("es.index.aliases.migration")
    ),
    url = string("es6.url"),
    cluster =  string("es6.cluster"),
    shards = string("es6.shards").toInt,
    replicas = string("es6.replicas").toInt
  )
}
