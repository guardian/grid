package com.gu.mediaservice.lib.bbc.components

import com.gu.mediaservice.lib.bbc.BBCImageProcessorConfig
import play.api.Configuration

import scala.collection.mutable
import scala.concurrent.ExecutionContext

object BBCImageProcessorsDependencies {
  implicit val ec = ExecutionContext.global

  private def memoize[A, B](f: A => B): A => B = new mutable.HashMap[A, B]() {
    override def apply(key: A) = getOrElseUpdate(key, f(key))
  }

  /*
  * The laziness here guarantees that the metadataStore will be only loaded if a BBC processor is instantiated.
  * */
  lazy val metadataStore: Configuration => MetadataStore = memoize { configuration =>
    val bbcImageProcessorConfig = new BBCImageProcessorConfig(configuration)
    val bucket = bbcImageProcessorConfig.configBucket
    val metadataStore = new MetadataStore(bucket, bbcImageProcessorConfig)
    metadataStore.update()
    metadataStore
  }

  lazy val usageRightsStore: Configuration => BBCUsageRightsStore = memoize { configuration =>
    val bbcImageProcessorConfig = new BBCImageProcessorConfig(configuration)
    val bucket = bbcImageProcessorConfig.configBucket
    val usageRightsStore = new BBCUsageRightsStore(bucket, bbcImageProcessorConfig)
    usageRightsStore.update()
    usageRightsStore
  }
}
