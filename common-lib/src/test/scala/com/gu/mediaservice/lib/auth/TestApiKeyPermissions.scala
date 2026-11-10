package com.gu.mediaservice.lib.auth

import play.api.libs.json.{Json, JsObject}

object TestApiKeyPermissions {
  private lazy val permissionsRepo: Map[String, (String, List[String])] = {
    val stream = getClass.getClassLoader.getResourceAsStream("api-key-permissions.json")
    val json = Json.parse(stream)
    (json.as[JsObject].value.map { case (key, value) =>
      val name = (value \ "name").as[String]
      val permissions = (value \ "permissions").as[List[String]]
      key -> (name, permissions)
    }).toMap
  }

  def getPermissions(apiKey: String): Option[(String, List[String])] = permissionsRepo.get(apiKey)
}
