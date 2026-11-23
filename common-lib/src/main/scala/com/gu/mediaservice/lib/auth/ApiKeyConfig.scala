package com.gu.mediaservice.lib.auth

import com.gu.permissions.PermissionDefinition
import com.gu.mediaservice.auth.Permissions
import play.api.libs.json.{Format, JsString, Json, OFormat, Writes, __}

import java.time.Instant

sealed trait Expiry {
  val days: Int
}

case object Day extends Expiry {
  val days: Int = 1
}
case object Week extends Expiry {
  val days: Int = 7
}
case object Month extends Expiry {
  val days: Int = 30
}

object Expiry {
  def fromString(s: String): Option[Int] = s.toLowerCase match {
    case "day" => Some(1)
    case "week" => Some(7)
    case "month" => Some(30)
    case _ => None
  }
}


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

  val defaultExpiry: Expiry= Day

  def resolveExpiry(requested: Option[Expiry], principalType: PrincipalType): Option[Expiry] =
    requested.orElse(Option.when(principalType == Developer)(defaultExpiry))

  private def expiresAt(expiry: Option[Expiry]): Option[Instant] =
    expiry.map(e => Instant.now().plusSeconds(60L * 60 * 24 * e.days))

  def apply(name: String, permissions: Seq[PermissionDefinition],
            principalType: PrincipalType, requestedExpiry: Option[Expiry]): ApiKeyConfig = {
    val resolved = resolveExpiry(requestedExpiry, principalType)
    ApiKeyConfig(name, permissions, expiresAt(resolved), principalType)
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
