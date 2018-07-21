package com.gu.mediaservice.lib.logging
import com.gu.mediaservice.lib.auth.ApiKey
import net.logstash.logback.marker.Markers

import scala.collection.JavaConverters._

object GridLogger {
  private val logger = LogConfig.rootLogger

  def info(message: String, markers: Map[String, Any] = Map()): Unit = logger.info(Markers.appendEntries(markers.asJava), message)

  def warn(message: String, markers: Map[String, Any] = Map()): Unit = logger.warn(Markers.appendEntries(markers.asJava), message)

  def error(message: String, markers: Map[String, Any] = Map()): Unit = logger.error(Markers.appendEntries(markers.asJava), message)

  def info(message: String, apiKey: ApiKey): Unit = {
    val markers = Map(
      "tier" -> apiKey.tier,
      "name" -> apiKey.name
    )

    info(message, markers)
  }
}
