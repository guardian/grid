package com.gu.mediaservice.lib.logging
import com.gu.mediaservice.lib.auth.ApiAccessor
import com.typesafe.scalalogging.{Logger, StrictLogging}
import net.logstash.logback.marker.Markers

import scala.collection.JavaConverters._

trait GridLogging extends StrictLogging {
  implicit class LoggerWithHelpers(logger: Logger) {
    def info(message: String, markers: Map[String, Any] = Map()): Unit = logger.info(Markers.appendEntries(markers.asJava), message)

    def warn(message: String, markers: Map[String, Any] = Map()): Unit = logger.warn(Markers.appendEntries(markers.asJava), message)

    def error(message: String, markers: Map[String, Any] = Map()): Unit = logger.error(Markers.appendEntries(markers.asJava), message)

    def info(message: String, apiKey: ApiAccessor): Unit = info(message, apiKeyMarkers(apiKey))

    def info(message: String, apiKey: ApiAccessor, imageId: String): Unit = info(message, apiKeyMarkers(apiKey) ++ imageIdMarker(imageId))

    def info(message: String, imageId: String): Unit = info(message, imageIdMarker(imageId))

    private def apiKeyMarkers(apiKey: ApiAccessor) = Map(
      "key-tier" -> apiKey.tier.toString,
      "key-name" -> apiKey.identity
    )

    private def imageIdMarker(imageId: String) = Map("image-id" -> imageId)
  }
}
