package com.gu.mediaservice.lib.elasticsearch6

case class ElasticSearch6Config(alias: String, host: String, port: Int, protocol: String, cluster: String, shards: Int, replicas: Int)
