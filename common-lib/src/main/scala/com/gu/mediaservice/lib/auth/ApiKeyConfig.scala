package com.gu.mediaservice.lib.auth

import com.gu.permissions.PermissionDefinition
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

case class ApiKeyConfig(name: String, permissions: Seq[PermissionDefinition], expiry: Option[Instant], principalType: PrincipalType) {
  def isExpired: Boolean = expiry.exists(_.isBefore(Instant.now()))
}


object ApiKeyConfig {
  def expiry(principalType: PrincipalType) = {
    principalType match {
      case Machine => None
      case Developer => Some(Instant.now().plusSeconds(60 * 60 * 24 * 1)) // 1 day
    }
  }

  def apply(name: String, permissions: Seq[PermissionDefinition], principalType: PrincipalType): ApiKeyConfig = {
    ApiKeyConfig(name, permissions, expiry(principalType), principalType)
  }

  implicit val apiKeyConfigFormat: OFormat[ApiKeyConfig] = Json.format[ApiKeyConfig]
}
