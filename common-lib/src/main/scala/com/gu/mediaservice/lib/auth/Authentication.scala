package com.gu.mediaservice.lib.auth

import play.api.mvc.Security.AuthenticatedBuilder

import play.api.mvc._
import play.api.libs.json.Json


object Authenticated {
  def apply(onUnauthorized: RequestHeader => SimpleResult): AuthenticatedBuilder[User] =
    AuthenticatedBuilder(req => User.fromRequest(req), onUnauthorized)
}

case class User(openid: String, email: String, firstName: String, lastName: String) {
  def fullName = firstName + " " + lastName
  def emailDomain = email.split("@").last
}

object User {
  val KEY = "identity"
  implicit val formats = Json.format[User]
  def readJson(json: String) = Json.fromJson[User](Json.parse(json)).get
  def writeJson(id: User) = Json.stringify(Json.toJson(id))
  def fromRequest(request: RequestHeader): Option[User] =
    request.session.get(KEY).map(User.readJson)
}
