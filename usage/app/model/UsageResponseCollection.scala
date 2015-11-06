package model

import com.gu.mediaservice.lib.argo.ArgoHelpers


object UsageResponseCollection extends ArgoHelpers {
  def respondUsageCollection(usages: Set[MediaUsage]) = {
    val flatUsages = usages.groupBy(_.grouping).flatMap { case (grouping, groupedUsages) => {
      val publishedUsage = groupedUsages.find(_.status match {
        case _: PublishedUsageStatus => true
        case _ => false
      })

      val mergedUsages = if (publishedUsage.isEmpty) {
          groupedUsages.headOption
        } else {
          publishedUsage
        }

      mergedUsages.filter(usage => (for {
        added <- usage.dateAdded
        removed <- usage.dateRemoved
      } yield added.isAfter(removed)).getOrElse(true))

    }}.toList

    respondCollections[UsageResponse](
      data = flatUsages.map(UsageResponse.build).groupBy(_.status.toString))
  }

  def build(usages: Set[MediaUsage]) = if(usages.isEmpty) {
    respondNotFound("No usages found.")
  } else {
    respondUsageCollection(usages)
  }
}
