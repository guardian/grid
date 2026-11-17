package com.gu.mediaservice.lib.auth

import play.api.libs.json.{Format, JsString, Json, OFormat, Writes, __}

import java.time.Instant

sealed trait PrincipalType
case object Developer extends PrincipalType
case object Machine extends PrincipalType

object PrincipalType {
  def fromString(s: String): PrincipalType = s.toLowerCase match {
    case "developer" => Developer
    case "machine" => Machine
  }

  implicit val format: Format[PrincipalType] = Format(
    __.read[String].map(a => fromString(a)),
    Writes(p => JsString(p.toString))
  )
}

case class ApiKeyConfig(name: String, tier: Tier, expiry: Option[Instant], userType: PrincipalType) {
  def isExpired: Boolean = expiry.exists(_.isBefore(Instant.now()))
}


object ApiKeyConfig {
  def expiry(tier: Tier, principalType: PrincipalType) = {
    (principalType, tier) match {
      case (Machine, _) => None
      case (Developer, Internal) => Some(Instant.now().plusSeconds(60 * 60 * 24 * 7)) // 7 days
      case (Developer, ReadOnly) => Some(Instant.now().plusSeconds(60 * 60 * 24 * 30)) // 30 days
      case (Developer, Syndication) => Some(Instant.now().plusSeconds(60 * 60 * 24 * 30)) // 30 days
    }
  }
  def apply(name: String, tier: Tier, userType: PrincipalType): ApiKeyConfig = {
    ApiKeyConfig(name, tier, expiry(tier, userType), userType)
  }

  implicit val apiKeyConfigFormat: OFormat[ApiKeyConfig] = Json.format[ApiKeyConfig]
}
