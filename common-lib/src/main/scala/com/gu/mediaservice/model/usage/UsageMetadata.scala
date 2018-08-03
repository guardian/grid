package com.gu.mediaservice.model.usage

trait UsageMetadata {
  def toMap: Map[String, Any]
}
