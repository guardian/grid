package com.gu.mediaservice.testlib

import org.scalatest.{BeforeAndAfterAll, Suite}
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.elasticsearch.ElasticsearchContainer

import scala.util.Properties
import scala.concurrent.duration._
import scala.compat.java8.DurationConverters._
import scala.jdk.CollectionConverters._


trait ElasticSearchDockerBase extends BeforeAndAfterAll {
  self: Suite =>
  val useEsDocker = Properties.envOrElse("USE_DOCKER_FOR_TESTS", "true").toBoolean

  val esContainer: Option[ElasticsearchContainer] = if (useEsDocker) {
    {
      val container = new ElasticsearchContainer("docker.elastic.co/elasticsearch/elasticsearch:7.16.2")
        .withExposedPorts(9200)
        .withAccessToHost(true)
        .withEnv(Map(
          "cluster.name" -> "media-service",
          "xpack.security.enabled" -> "false",
          "discovery.type" -> "single-node",
          "network.host" -> "0.0.0.0"
        ).asJava)
        .waitingFor(Wait.forHttp("/")
          .forPort(9200)
          .forStatusCode(200)
          .withStartupTimeout(180.seconds.toJava)
        )
      container.start()
      Some(container)
    }
  } else None

  val esPort = esContainer.map(_.getMappedPort(9200)).getOrElse(9200)
  val esTestUrl = Properties.envOrElse("ES6_TEST_URL", s"http://localhost:$esPort")

  override protected def afterAll(): Unit = {
    super.afterAll()

    esContainer foreach { _.stop() }
  }
}
