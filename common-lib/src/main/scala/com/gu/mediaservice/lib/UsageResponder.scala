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

  def forUsage(usageOption: Option[Usage], mediaId: String) = {
    usageOption.foldLeft(
      respondNotFound("No usages found.")
    )((_, usage: Usage) => {
      val encodedUsageId = UriEncoding.encodePathSegment(usage.id, "UTF-8")
      val uri = usageUri(usage.id)
      val links = List(
        Link("media", s"${services.apiBaseUri}/images/${mediaId}"),
        Link("media-usage", s"${services.usageBaseUri}/usages/media/${mediaId}")
      )

      respond[Usage](data = usage, uri = uri, links = links)
    })
  }

  def forMediaUsages(usages: List[Usage], mediaId: String) = usages match {
    case Nil => respondNotFound("No usages found.")
    case usage :: _ => {
      val uri = Try { new URI(s"${services.usageBaseUri}/usages/media/${mediaId}") }.toOption
      val links = List(
        Link("media", s"${services.apiBaseUri}/images/${mediaId}")
      )

      respondCollection[EntityReponse[Usage]](
        uri = uri,
        links = links,
        data = usages.map(wrapUsage)
      )
    }
  }
}
