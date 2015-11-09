package model

import lib.MD5


case class UsageId(id: String) {
  override def toString = id
}
object UsageId {
  def buildId(parts: List[Option[Any]]) =
    UsageId(MD5.hash(parts.flatten.map(_.toString).mkString("_")))

  def build(printUsageRecord: PrintUsageRecord) = buildId(List(
    Some(printUsageRecord.mediaId),
    Some(printUsageRecord.usageId),
    Some(printUsageRecord.usageStatus)
  ))

 def build(elementWrapper: ElementWrapper, contentWrapper: ContentWrapper) = buildId(List(
    Some(elementWrapper.media.id),
    Some(elementWrapper.index),
    Some(contentWrapper.status)
  ))
}
