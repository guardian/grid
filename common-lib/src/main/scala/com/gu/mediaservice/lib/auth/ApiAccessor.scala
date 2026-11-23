package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.config.Services
import play.api.libs.json.{Format, JsString, Writes, __}
import play.api.mvc.{RequestHeader, Result}

sealed trait Tier
case object Administrator extends Tier
case object Internal extends Tier
case object ReadOnly extends Tier
case object Syndication extends Tier

object Tier {
  def apply(value: String): Tier = value.toLowerCase match {
    case "internal" => Internal
    case "syndication" => Syndication
    case "administrator" => Administrator
    case _ => ReadOnly // readonly by default
  }
  def asString(tier: Tier): String = tier match {
    case Internal => "internal"
    case ReadOnly => "readonly"
    case Syndication => "syndication"
  }

  implicit val format: Format[Tier] = Format(
    __.read[String].map(Tier(_)),
    Writes(t => JsString(asString(t)))
  )
}

case class ApiAccessor(identity: String, tier: Tier)
object ApiAccessor extends ArgoHelpers {
  def apply(content: String): ApiAccessor = {
    val rows = content.split("\n")
    val name = rows.headOption.getOrElse("")
    val tier = rows.tail.headOption.map(Tier(_)).getOrElse(Internal)
    ApiAccessor(name, tier)
  }

  def hasAccess(apiKey: ApiAccessor, request: RequestHeader, services: Services): Boolean = apiKey.tier match {
    case Internal => request.method != "DELETE"
    case ReadOnly => request.method == "GET"
    case Syndication => request.method == "GET" && request.host == services.apiHost && request.path.startsWith("/images")
    case Administrator => true
  }
}
