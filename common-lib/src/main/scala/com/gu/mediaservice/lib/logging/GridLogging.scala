package com.gu.mediaservice.lib.logging
import com.gu.mediaservice.lib.auth.ApiAccessor
import com.typesafe.scalalogging.{Logger, StrictLogging}
import net.logstash.logback.marker.Markers

import scala.collection.JavaConverters._

trait GridLogging extends StrictLogging {
  case class ImageId(id: String)

  implicit class LoggerWithHelpers(logger: Logger) {
    def debug(markers: Map[String, Any], message: String): Unit = logger.debug(Markers.appendEntries(markers.asJava), message)
    def debug(markers: LogMarker, message: String): Unit = logger.debug(markers.toLogMarker, message)

    def info(markers: Map[String, Any], message: String): Unit = logger.info(Markers.appendEntries(markers.asJava), message)
    def info(markers: LogMarker, message: String): Unit = logger.info(markers.toLogMarker, message)

    def warn(markers: Map[String, Any], message: String): Unit = logger.warn(Markers.appendEntries(markers.asJava), message)
    def warn(markers: LogMarker, message: String): Unit = logger.warn(markers.toLogMarker, message)
    def warn(markers: LogMarker, message: String, cause: Throwable): Unit = logger.warn(markers.toLogMarker, message, cause)

    def error(markers: Map[String, Any], message: String): Unit = logger.error(Markers.appendEntries(markers.asJava), message)
    def error(markers: LogMarker, message: String): Unit = logger.error(markers.toLogMarker, message)
    def error(markers: LogMarker, message: String, cause: Throwable): Unit = logger.error(markers.toLogMarker, message, cause)
  }

  // TODO these should be extracted and entered into markers in a reusable way, maybe via RequestLoggingFilter?
  def apiKeyMarkers(apiKey: ApiAccessor): Map[String, String] = Map(
    "key-tier" -> apiKey.tier.toString,
    "key-name" -> apiKey.identity
  )

  def imageIdMarker(imageId: String): Map[String, String] = Map("image-id" -> imageId)
  def imageIdMarker(imageId: ImageId): Map[String, String] = imageIdMarker(imageId.id)
}
