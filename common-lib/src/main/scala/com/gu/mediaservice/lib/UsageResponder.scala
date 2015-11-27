package com.gu.mediaservice.lib

import java.net.URI

import _root_.play.utils.UriEncoding
import scala.util.Try
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.{EntityReponse, Link}
import com.gu.mediaservice.lib.config.Services
import com.gu.mediaservice.model.Usage


class UsageResponder(services: Services) extends ArgoHelpers {

  private def usageUri(usageId: String): Option[URI] = {
    val encodedUsageId = UriEncoding.encodePathSegment(usageId, "UTF-8")
    Try { new URI(s"${services.usageBaseUri}/usages/${encodedUsageId}") }.toOption
  }

  private def wrapUsage(usage: Usage): EntityReponse[Usage] = {
    EntityReponse(
      uri = usageUri(usage.id),
      data = usage
    )
  }

  def forUsage(usageOption: Option[Usage]) = {
    usageOption.foldLeft(
      respondNotFound("No usages found.")
    )((_, usage: Usage) => {
      val encodedUsageId = UriEncoding.encodePathSegment(usage.id, "UTF-8")
      val uri = usageUri(usage.id)
      val links = List(
        Link("media", s"${services.apiBaseUri}/images/${usage.mediaId}"),
        Link("media-usage", s"${services.usageBaseUri}/usages/media/${usage.mediaId}")
      )

      respond[Usage](data = usage, uri = uri, links = links)
    })
  }

  def forMediaUsages(usages: List[Usage]) = usages match {
    case Nil => respondNotFound("No usages found.")
    case usage :: _ => {
      val mediaId = usage.mediaId

      val uri = Try { new URI(s"${services.usageBaseUri}/usages/media/${mediaId}") }.toOption
      val links = List(
        Link("media", s"${services.apiBaseUri}/images/${mediaId}")
      )

      val flatUsages = usages.groupBy(_.grouping).flatMap { case (grouping, groupedUsages) => {
        val publishedUsage = groupedUsages.find(_.status match {
          case "published" => true
          case _ => false
        })

        if (publishedUsage.isEmpty) {
            groupedUsages.headOption
        } else {
            publishedUsage
        }

      }}

      respondCollection[EntityReponse[Usage]](
        uri = uri,
        links = links,
        data = flatUsages.toList.map(wrapUsage)
      )
    }
  }
}
