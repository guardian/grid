package model

import lib.MD5


case class UsageId(id: String) {
  override def toString = id
}
object UsageId {
  // The purpose of this hash is to obfuscate the usage_id
  def createUsageId(mediaId: String, status: UsageStatus, index: Int) =
    MD5.hash(s"${mediaId}_${index}_${status}")

  def build(elementWrapper: ElementWrapper, contentWrapper: ContentWrapper): UsageId = {
     UsageId(createUsageId(
      elementWrapper.media.id,
      contentWrapper.status,
      elementWrapper.index
    ))
  }
}
