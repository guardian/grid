package model


case class UsageRecord(
  usageId: String,
  grouping: String,
  mediaId: String,
  usageType: String,
  mediaType: String,
  status: String
)

object UsageRecord {
  def fromUsageGroup(usageGroup: UsageGroup) = usageGroup.usages.map(usage => {
    fromMediaUsageAndStatus(usage, usageGroup.status)
  })

  def fromMediaUsageAndStatus(mediaUsage: MediaUsage, usageStatus: UsageStatus) =
    UsageRecord(
      mediaUsage.usageId,
      mediaUsage.grouping,
      mediaUsage.element.id,
      "web",  // TODO: these shouldn't be hardcoded here
      "image",
      usageStatus match {
        case _:PendingUsageStatus => "pending"
        case _:PubishedUsageStatus => "published"
      }
    )
}
