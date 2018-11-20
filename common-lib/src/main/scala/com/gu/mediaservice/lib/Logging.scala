package com.gu.mediaservice.lib

import org.slf4j.LoggerFactory

trait Logging {
  protected final val Logger = LoggerFactory.getLogger(this.getClass)
}
