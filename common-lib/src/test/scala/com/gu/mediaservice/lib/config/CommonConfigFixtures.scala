package com.gu.mediaservice.lib.config
import play.api.Configuration
import play.api.inject.ApplicationLifecycle

import scala.concurrent.Future

trait CommonConfigFixtures {
  val USED_CONFIGS_IN_TEST = Map(
    "es6.shards" -> 0,
    "es6.replicas" -> 0,
    "field.aliases" -> Seq.empty,
    "usageRights" -> Map(
      "applicable" -> List(),
      "showV2" -> false
    ),
    "usageRightsConfigProvider" -> "com.gu.mediaservice.lib.config.RuntimeUsageRightsConfig"
  )
  val NOT_USED_IN_TEST = "not used in test"
  val MOCK_CONFIG_KEYS = Seq(
    "auth.keystore.bucket",
    "persistence.identifier",
    "thrall.kinesis.stream.name",
    "thrall.kinesis.lowPriorityStream.name",
    "domain.root",
    "s3.config.bucket",
    "s3.usagemail.bucket",
    "quota.store.key",
    "es.index.aliases.current",
    "es.index.aliases.migration",
    "es6.url",
    "s3.image.bucket",
    "s3.thumb.bucket",
    "grid.stage",
    "grid.appName"
  )

  val commonConfigurations = USED_CONFIGS_IN_TEST ++ MOCK_CONFIG_KEYS.map(_ -> NOT_USED_IN_TEST).toMap

  def createGridResourcesConfig(commonConfigurations: Map[String, Any], overrides: Map[String, Any] = Map[String, Any]()) = {
    val config = Configuration.from(overrides)
      .withFallback(Configuration.from(commonConfigurations))
    GridConfigResources(
      config,
      null,
      new ApplicationLifecycle {
        override def addStopHook(hook: () => Future[_]): Unit = {}
        override def stop(): Future[_] = Future.successful(())
      }
    )
  }

}
