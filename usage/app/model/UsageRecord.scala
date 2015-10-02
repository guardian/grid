package model


case class UsageRecord(
  usageId: String,
  grouping: String,
  imageId: String
)

object UsageRecord {
  def fromMediaUsage(mediaUsage: MediaUsage) =
    UsageRecord(
      mediaUsage.usageId,
      mediaUsage.grouping,
      mediaUsage.image.id
    )
}
