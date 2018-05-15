package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.argo.ArgoHelpers
import play.api.mvc.Request

sealed trait Tier
case object Internal extends Tier
case object External extends Tier
object Tier {
  def apply(value: String): Tier = value.toLowerCase match {
    case "internal" => Internal
    case "external" => External
    case _ => External
  }
}

case class ApiKey(value: String, tier: Tier)
object ApiKey extends ArgoHelpers {
  val unauthorizedResult = respondError(Forbidden, "forbidden", "Unauthorized - the API key is not allowed to perform this operation", List.empty)

  def apply(content: String): ApiKey = {
    val rows = content.split("\n")
    val name = rows.head
    val tier = rows.tail.headOption.map(Tier(_)).getOrElse(Internal)
    ApiKey(name, tier)
  }

  def hasAccess(apiKey: ApiKey, request: Request[Any]): Boolean = apiKey.tier match {
    case External if request.method != "GET" || !request.path.startsWith("/images") => false //TODO: Also check domain to be api.media
    case _ => true
  }
}