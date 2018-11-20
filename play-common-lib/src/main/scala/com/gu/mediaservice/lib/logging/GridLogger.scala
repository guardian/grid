package com.gu.mediaservice.lib.logging

import com.gu.mediaservice.lib.Logging
import com.gu.mediaservice.lib.auth.ApiKey
import net.logstash.logback.marker.Markers

import scala.collection.JavaConverters._

object GridLogger extends Logging {
  def info(message: String, markers: Map[String, Any] = Map()): Unit = Logger.info(Markers.appendEntries(markers.asJava), message)

  def warn(message: String, markers: Map[String, Any] = Map()): Unit = Logger.warn(Markers.appendEntries(markers.asJava), message)

  def error(message: String, markers: Map[String, Any] = Map()): Unit = Logger.error(Markers.appendEntries(markers.asJava), message)

  def info(message: String, apiKey: ApiKey): Unit = info(message, apiKeyMarkers(apiKey))

  def info(message: String, apiKey: ApiKey, imageId: String): Unit = info(message, apiKeyMarkers(apiKey) ++ imageIdMarker(imageId))

  def info(message: String, imageId: String): Unit = info(message, imageIdMarker(imageId))

  private def apiKeyMarkers(apiKey: ApiKey) = Map(
    "key-tier" -> apiKey.tier,
    "key-name" -> apiKey.name
  )

  private def imageIdMarker(imageId: String) = Map("image-id" -> imageId)
}
