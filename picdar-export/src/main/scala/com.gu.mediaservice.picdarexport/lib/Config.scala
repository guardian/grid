package com.gu.mediaservice.picdarexport.lib

import com.amazonaws.auth.BasicAWSCredentials
import com.amazonaws.regions.{Regions, Region}
import com.gu.mediaservice.lib.config.Properties

case class MediaConfig(apiKey: String, loaderUrl: String)

object Config {
  val properties = Properties.fromPath("/etc/gu/picdar-export.properties")

  def awsAccessId(env: String)       = properties(s"aws.$env.id")
  def awsAccessSecret(env: String)   = properties(s"aws.$env.secret")
  def picdarExportTable(env: String) = properties(s"aws.$env.picdarexport.table")

  def awsCredentials(env: String) = new BasicAWSCredentials(awsAccessId(env), awsAccessSecret(env))
  val dynamoRegion = Region.getRegion(Regions.EU_WEST_1)


  val picdarDeskUrl      = properties("picdar.desk.url")
  val picdarDeskUsername = properties("picdar.desk.username")
  val picdarDeskPassword = properties("picdar.desk.password")

  val picdarLibraryUrl      = properties("picdar.library.url")
  val picdarLibraryUsername = properties("picdar.library.username")
  val picdarLibraryPassword = properties("picdar.library.password")


  def mediaConfig(env: String): MediaConfig = try {
    val apiKey    = properties(s"media.$env.apiKey")
    val loaderUrl = properties(s"media.$env.loaderUrl")
    MediaConfig(apiKey, loaderUrl)
  } catch {
    case _: Throwable => throw new Error(s"Invalid media environment name: $env")
  }

}
