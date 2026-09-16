package com.gu.mediaservice.model.usage

import com.gu.mediaservice.lib.dynamo.DynamoElement

trait UsageMetadata {
  def toMap: Map[String, Any]
  def toDynamoMap: Map[String, DynamoElement]
}
