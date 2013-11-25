package com.gu.mediaservice.lib.auth

import play.api.mvc.Security.AuthenticatedBuilder
import play.api.mvc._
import play.api.libs.json.Json

object Authenticated {
  def apply(onUnauthorized: RequestHeader => SimpleResult): AuthenticatedBuilder[Principal] =
    AuthenticatedBuilder(Principal.fromRequest, onUnauthorized)
}

sealed trait Principal {
  def name: String
}

case class User(openid: String, email: String, firstName: String, lastName: String) extends Principal {
  def name = s"$firstName $lastName"
  def emailDomain = email.split("@").last
}

case class ServicePeer(name: String) extends Principal

object User {
  val KEY = "identity"
  implicit val formats = Json.format[User]
  def readJson(json: String) = Json.fromJson[User](Json.parse(json)).get
  def writeJson(id: User) = Json.stringify(Json.toJson(id))
  def fromRequest(request: RequestHeader): Option[User] =
    request.session.get(KEY).map(User.readJson)
}

object Principal {

  /** As a workaround until services have API keys, assumes that any
    * non-HTTPS or non-load-balanced traffic is from internal trusted clients.
    */
  def fromRequest(request: RequestHeader): Option[Principal] =
    request.headers.get("X-Forwarded-Proto") match {
      case Some("https") | None => User.fromRequest(request)
      case Some("http")         => Some(ServicePeer("Trusted internal service"))
      case Some(_)              => None
    }
}
