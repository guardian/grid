package com.gu.mediaservice.lib.elasticsearch

case class ElasticSearchConfig(alias: String, accretorAlias: String, url: String, cluster: String, shards: Int, replicas: Int)
