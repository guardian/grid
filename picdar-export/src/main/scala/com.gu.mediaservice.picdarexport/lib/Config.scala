package com.gu.mediaservice.picdarexport.lib

import com.amazonaws.auth.BasicAWSCredentials
import com.amazonaws.regions.{Regions, Region}
import com.gu.mediaservice.lib.config.Properties

case class MediaConfig(apiKey: String, loaderUrl: String)

object Config {
  val properties = Properties.fromPath("/etc/gu/picdar-export.properties")

  val awsAccessId = properties("aws.id")
  val awsAccessSecret = properties("aws.secret")

  val awsCredentials = new BasicAWSCredentials(awsAccessId, awsAccessSecret)
  val dynamoRegion = Region.getRegion(Regions.EU_WEST_1)
  val picdarExportTable = properties("aws.picdarexport.table")


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
