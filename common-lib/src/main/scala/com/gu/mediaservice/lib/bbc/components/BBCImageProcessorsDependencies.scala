package com.gu.mediaservice.lib.bbc.components

import akka.actor.ActorSystem
import com.gu.mediaservice.lib.bbc.BBCImageProcessorConfig
import com.gu.mediaservice.lib.cleanup.ImageProcessorResources
import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration

import scala.collection.mutable
import scala.concurrent.ExecutionContext

trait BBCDependenciesConfig {
  def commonConfiguration: CommonConfig
  def actorSystem: ActorSystem
}

object BBCDependenciesConfig {
  def apply(resources: ImageProcessorResources): BBCDependenciesConfig = new BBCDependenciesConfig {
    override def commonConfiguration: CommonConfig = resources.commonConfiguration
    override def actorSystem: ActorSystem = resources.actorSystem
  }
}

object BBCImageProcessorsDependencies {
  implicit val ec = ExecutionContext.global

  private def memoizeOnce[A, B](f: A => B): A => B = new ((A) => B) {
    var save: Option[B] = None
    override def apply(a: A): B = {
      save match {
        case Some(b) => b
        case None => {
          val process = f(a)
          save = Some(process)
          process
        }
      }
    }
  }

  /*
  * The laziness here guarantees that only the used dependencies are loaded
  * */
  lazy val metadataStore: BBCDependenciesConfig => BBCMetadataStore = memoizeOnce { resources =>
    val bbcImageProcessorConfig = new BBCImageProcessorConfig(resources.commonConfiguration.configuration)
    val bucket = bbcImageProcessorConfig.configBucket
    val metadataStore = new BBCMetadataStore(bucket, resources.commonConfiguration)
    metadataStore.scheduleUpdates(resources.actorSystem.scheduler)
    metadataStore
  }

  lazy val usageRightsStore: BBCDependenciesConfig => BBCUsageRightsStore = memoizeOnce { resources =>
    val bbcImageProcessorConfig = new BBCImageProcessorConfig(resources.commonConfiguration.configuration)
    val bucket = bbcImageProcessorConfig.configBucket
    val usageRightsStore = new BBCUsageRightsStore(bucket, resources.commonConfiguration)
    usageRightsStore.scheduleUpdates(resources.actorSystem.scheduler)
    usageRightsStore
  }
}
