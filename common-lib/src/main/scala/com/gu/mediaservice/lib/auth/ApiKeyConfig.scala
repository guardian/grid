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

case class ApiKeyConfig(name: String, permissions: Seq[PermissionDefinition], expiresAt: Option[Instant], principalType: PrincipalType) {
  def isExpired: Boolean = expiresAt.exists(_.isBefore(Instant.now()))
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

  private val byName: Map[String, PermissionDefinition] =
    Permissions.all.map(p => p.name -> p).toMap

  private def resolve(name: String): PermissionDefinition =
    byName.getOrElse(name, throw new IllegalArgumentException(s"Unknown permission '$name'"))

  implicit val apiKeyConfigFormat: OFormat[ApiKeyConfig] = {
    import play.api.libs.functional.syntax._
    (
      (__ \ "name").format[String] and
        (__ \ "permissions").format[Seq[String]]
          .inmap[Seq[PermissionDefinition]](_.map(resolve), _.map(_.name)) and
        (__ \ "expiresAt").formatNullable[Instant] and
        (__ \ "principalType").format[PrincipalType]
      )(ApiKeyConfig.apply _ , a => (a.name, a.permissions, a.expiresAt, a.principalType))
  }
}
