package com.gu.mediaservice.picdarexport.lib

import play.api.Play

case class MediaConfig(apiKey: String, loaderUrl: String)

object Config {
  final val appConfig = Play.current.configuration

  def readString(key: String): String =
    appConfig.getString(key) getOrElse { throw new Error(s"Missing config key: $key") }

  val picdarDeskUrl      = readString("picdar.desk.url")
  val picdarDeskUsername = readString("picdar.desk.username")
  val picdarDeskPassword = readString("picdar.desk.password")

  val picdarLibraryUrl      = readString("picdar.library.url")
  val picdarLibraryUsername = readString("picdar.library.username")
  val picdarLibraryPassword = readString("picdar.library.password")


  def mediaConfig(env: String): MediaConfig = try {
    val apiKey    = readString(s"media.$env.apiKey")
    val loaderUrl = readString(s"media.$env.loaderUrl")
    MediaConfig(apiKey, loaderUrl)
  } catch {
    case _: Throwable => throw new Error(s"Invalid media environment name: $env")
  }

}
