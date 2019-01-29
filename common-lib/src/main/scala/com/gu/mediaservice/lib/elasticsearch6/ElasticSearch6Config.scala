package com.gu.mediaservice.lib.elasticsearch6

case class ElasticSearch6Config(writeAlias: String, host: String, port: Int, cluster: String, shards: Int, replicas: Int)
