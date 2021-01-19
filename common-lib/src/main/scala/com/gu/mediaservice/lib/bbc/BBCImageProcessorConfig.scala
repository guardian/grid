package com.gu.mediaservice.lib.bbc

import play.api.Configuration

/** a comment on a BBC file */
class BBCImageProcessorConfig(config: Configuration) {
  val configBucket: String = config.get[String]("s3.config.bucket")
}
