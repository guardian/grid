package com.gu.mediaservice.lib.elasticsearch

case class ElasticSearchConfig(aliases: ElasticSearchAliases, url: String, shards: Int, replicas: Int)
