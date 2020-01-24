package com.gu.mediaservice.model.usage

import scala.util.Try

case class UsageTableFullKey(hashKey: String, rangeKey: String) {
  override def toString = List(
    hashKey,
    rangeKey
  ).mkString(UsageTableFullKey.keyDelimiter)
}
object UsageTableFullKey {
  val keyDelimiter = "_"

  def build(mediaUsage: MediaUsage): UsageTableFullKey = {
    UsageTableFullKey(mediaUsage.grouping, mediaUsage.usageId.toString)
  }

  def build(combinedKey: String): Option[UsageTableFullKey] = {
    val pair = combinedKey.split(keyDelimiter)

    Try { pair match { case Array(h,r) => UsageTableFullKey(h, r) } }.toOption
  }
}
