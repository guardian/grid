package com.gu.mediaservice.model

import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}

trait ThrallMessage extends GridLogging with LogMarker {
  val subject: String = this.getClass.getSimpleName
  def additionalMarkers: () => Map[String, Any] = () => Map()

  override def markerContents: Map[String, Any] = {
    Map (
      "subject" -> subject
    )
  }
}


