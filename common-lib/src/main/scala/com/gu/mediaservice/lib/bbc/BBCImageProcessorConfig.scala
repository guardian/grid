package com.gu.mediaservice.lib.bbc

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration

class BBCImageProcessorConfig(config: Configuration) extends CommonConfig(config) {
  val configBucket = string("s3.config.bucket")
}
