package com.gu.mediaservice.lib.elasticsearch

case class ElasticSearchConfig(alias: String, url: String, cluster: String, shards: Int, replicas: Int)
