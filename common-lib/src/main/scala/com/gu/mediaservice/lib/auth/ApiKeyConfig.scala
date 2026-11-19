package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.auth.Permissions
import com.gu.permissions.PermissionDefinition
import play.api.libs.json.{Format, JsString, OFormat, Writes, __}

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

  val defaultExpiryDays = 1

  def expiry(expiryDays: Option[Int], principalType: PrincipalType): Option[Instant] = {
    val days = expiryDays
      .filter(_ >= 1)
      .orElse(Option.when(principalType == Developer)(defaultExpiryDays))
    days.map(d => Instant.now().plusSeconds(60 * 60 * 24 * d))
  }
  def apply(name: String, permissions: Seq[PermissionDefinition], principalType: PrincipalType, expiryDays: Option[Int]): ApiKeyConfig = {
    ApiKeyConfig(name, permissions, expiry(expiryDays, principalType), principalType)
  }

  implicit val apiKeyConfigFormat: OFormat[ApiKeyConfig] = Json.format[ApiKeyConfig]
}
