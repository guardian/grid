package model

import java.net.URI
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.model.Usage
import lib.UsageBuilder

import com.gu.mediaservice.lib.argo.model.EntityReponse


object UsageResponse extends ArgoHelpers {

  private def respondUsage(uri: Option[URI], links: List[Link], mediaUsage: MediaUsage) =
    respond[Usage](data = UsageBuilder.build(mediaUsage), uri = uri, links = links)

  private def respondUsageCollection(uri: Option[URI], links: List[Link], usages: Set[MediaUsage]) = {
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

      mergedUsages.filter(_.isRemoved)

    }}.toList

    respondCollection[EntityReponse[Usage]](
      uri = uri,
      links = links,
      data = flatUsages.map((mediaUsage: MediaUsage) =>
          wrapUsage(UsageBuilder.build(mediaUsage)))
    )
  }

  def wrapUsage(usage: Usage): EntityReponse[Usage] = {
    val uri = Some(new URI("http://www.example.com/foop"))

    EntityReponse(
      uri = uri,
      data = usage
    )
  }

  def buildUsage(usage: Option[MediaUsage], uri: Option[URI] = None, links: List[Link] = List()) = usage.foldLeft(
    respondNotFound("No usages found.")
  )((_, mediaUsage: MediaUsage) => respondUsage(uri, links, mediaUsage))

  def buildUsages(usages: Set[MediaUsage], uri: Option[URI] = None, links: List[Link] = List()) =
    if(usages.isEmpty) {
      respondNotFound("No usages found.")
    } else {
      respondUsageCollection(uri, links, usages)
    }
}
