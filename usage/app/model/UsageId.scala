package model

import lib.MD5


case class UsageId(id: String) {
  override def toString = id
}
object UsageId {
  def build(printUsageRecord: PrintUsageRecord) = UsageId(
    MD5.hash(s"${printUsageRecord.mediaId}_${printUsageRecord.usageId}_${printUsageRecord.usageStatus}"))

  def build(elementWrapper: ElementWrapper, contentWrapper: ContentWrapper) = UsageId(
    MD5.hash(s"${elementWrapper.media.id}_${elementWrapper.index}_${contentWrapper.status}"))
}
