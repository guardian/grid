package com.gu.mediaservice.lib.auth

import scala.io.Source

object TestKeys {
  def v2KeyWithPermissions: String = {
    val resource = getClass.getClassLoader.getResourceAsStream("api-key-v2.json")
    Source.fromInputStream(resource).mkString
  }

  def v2KeyNoPermissions: String = {
    val resource = getClass.getClassLoader.getResourceAsStream("api-key-v2-no-permissions.json")
    Source.fromInputStream(resource).mkString
  }
}


