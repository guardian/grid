package com.gu.mediaservice.lib.bbc.components

import com.gu.mediaservice.lib.bbc.BBCImageProcessorConfig
import play.api.Configuration

import scala.collection.mutable
import scala.concurrent.ExecutionContext

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
  * The laziness here guarantees that the metadataStore will be only loaded if a BBC processor is instantiated.
  * */
  lazy val metadataStore: Configuration => MetadataStore = memoizeOnce { configuration =>
    val bbcImageProcessorConfig = new BBCImageProcessorConfig(configuration)
    val bucket = bbcImageProcessorConfig.configBucket
    val metadataStore = new MetadataStore(bucket, bbcImageProcessorConfig)
    metadataStore.update()
    metadataStore
  }

  lazy val usageRightsStore: Configuration => BBCUsageRightsStore = memoizeOnce { configuration =>
    val bbcImageProcessorConfig = new BBCImageProcessorConfig(configuration)
    val bucket = bbcImageProcessorConfig.configBucket
    val usageRightsStore = new BBCUsageRightsStore(bucket, bbcImageProcessorConfig)
    usageRightsStore.update()
    usageRightsStore
  }
}
