package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.config.Services
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.permissions.PermissionDefinition
import play.api.libs.json.{JsError, JsSuccess, Json}
import play.api.mvc.RequestHeader

import java.time.Instant

sealed trait Tier
case object Administrator extends Tier
case object Internal extends Tier
case object ReadOnly extends Tier
case object Syndication extends Tier
case class PermissionTier(permissions: Seq[PermissionDefinition]) extends Tier

object Tier {

  def parseV1(value: String): Tier = value.toLowerCase match {
    case "internal" => Internal
    case "syndication" => Syndication
    case "administrator" => Administrator
    case _ => ReadOnly // readonly by default
  }
  def parseV2(permissions: Seq[PermissionDefinition]): Tier = {
    PermissionTier(permissions)
  }
}

case class ApiAccessor(identity: String, tier: Tier,  expiresAt: Option[Instant] = None) {
  def hasExpired: Boolean = expiresAt.exists(_.isBefore(Instant.now()))
}

object ApiAccessor extends ArgoHelpers with GridLogging {
  def apply(content: String): ApiAccessor = {
    parseContentV2(content) getOrElse parseContentV1(content)
  }

  private def parseContentV2(content: String): Option[ApiAccessor] = {
    try {
      val json = Json.parse(content)
      json.validate[ApiKeyConfig] match {
        case JsSuccess(config, _) =>
          Some(ApiAccessor(config.name, Tier.parseV2(config.permissions), config.expiresAt))
        case JsError(errors) =>
          logger.warn(s"Failed to parse API key config JSON: $errors")
          None
      }
    } catch {
      case e: Exception =>
        logger.warn(s"Failed to parse API key config JSON: ${e.getMessage}")
        None
    }
  }

  private def parseContentV1(content: String): ApiAccessor = {
    val rows = content.split("\n")
    val name = rows.headOption.getOrElse("")
    val tier = rows.tail.headOption.map(Tier.parseV1).getOrElse(Internal)
    ApiAccessor(name, tier)
  }

  def hasAccess(apiKey: ApiAccessor, request: RequestHeader, services: Services): Boolean = apiKey.tier match {
    case Internal => request.method != "DELETE"
    case ReadOnly => request.method == "GET"
    case Syndication => request.method == "GET" && request.host == services.apiHost && request.path.startsWith("/images")
    case Administrator => true
    case _ => true // Pass through for future permissioned tiers, which will be handled by the PermissionsAuthorisationProvider
  }
}
