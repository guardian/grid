package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.config.Services
import play.api.mvc.{RequestHeader, Result}

sealed trait Tier
case object Internal extends Tier
case object ReadOnly extends Tier
case object Syndication extends Tier

object Tier {
  def apply(value: String): Tier = value.toLowerCase match {
    case "internal" => Internal
    case "syndication" => Syndication
    case _ => ReadOnly // readonly by default
  }
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
    case Internal => true
    case ReadOnly => request.method == "GET"
    case Syndication => request.method == "GET" && request.host == services.apiHost && request.path.startsWith("/images")
  }
}
