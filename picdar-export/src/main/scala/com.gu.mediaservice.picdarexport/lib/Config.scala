package com.gu.mediaservice.picdarexport.lib

import com.amazonaws.auth.BasicAWSCredentials
import com.amazonaws.regions.{Regions, Region}
import com.gu.mediaservice.lib.config.Properties

import scala.util.Try
import java.io.File
import java.io.FileNotFoundException


case class MediaConfig(apiKey: String, loaderUrl: String, usageUrl: String)

object Config {

  val propertiesFile = List(
    "picdar-export.properties",
    "/etc/gu/picdar-export.properties"
  ).find(new File(_).exists)
    .getOrElse(
      throw new FileNotFoundException(
        "Properties file could not be found!"))

  val properties = Properties.fromPath(propertiesFile)

  def awsAccessId(env: String)       = properties(s"aws.$env.id")
  def awsAccessSecret(env: String)   = properties(s"aws.$env.secret")
  def picdarExportTable(env: String) = properties(s"aws.$env.picdarexport.table")
  def picdarUsageTable(env: String)  = properties(s"aws.$env.picdarusage.table")

  def awsCredentials(env: String) = new BasicAWSCredentials(awsAccessId(env), awsAccessSecret(env))
  val dynamoRegion = Region.getRegion(Regions.EU_WEST_1)

  def picdarUsageApiUrl  = properties(s"picdar.usageapi.url")

  val defaultOverwrite   = false
  def overwriteFlag      = Try(properties("overwrite.active").toBoolean).getOrElse(defaultOverwrite)

  val picdarDeskUrl      = properties("picdar.desk.url")
  val picdarDeskUsername = properties("picdar.desk.username")
  val picdarDeskPassword = properties("picdar.desk.password")

  val picdarLibraryUrl      = properties("picdar.library.url")
  val picdarLibraryUsername = properties("picdar.library.username")
  val picdarLibraryPassword = properties("picdar.library.password")

  // Configure concurrency (thread pool size) of different services
  val concurrencyPicdarAsset = properties("concurrency.picdar.asset").toInt
  val concurrencyMediaLoader = properties("concurrency.media.loader").toInt
  val concurrencyMediaApi    = properties("concurrency.media.api").toInt

  // Configure timeouts for all services
  private val defaultConnectionTimeout =  5000 // ms
  private val defaultReadTimeout       = 15000 // ms

  private def readTimeout(name: String, default: Int) = properties.get(name).map(_.toInt) getOrElse default

  val picdarApiConnTimeout   = readTimeout("timeout.connection.picdar.api",   defaultConnectionTimeout)
  val picdarApiReadTimeout   = readTimeout("timeout.read.picdar.api",         defaultReadTimeout)
  val picdarAssetConnTimeout = readTimeout("timeout.connection.picdar.asset", defaultConnectionTimeout)
  val picdarAssetReadTimeout = readTimeout("timeout.read.picdar.asset",       defaultReadTimeout)
  val loaderConnTimeout      = readTimeout("timeout.connection.media.loader", defaultConnectionTimeout)
  val loaderReadTimeout      = readTimeout("timeout.read.media.loader",       defaultReadTimeout)
  val mediaApiConnTimeout    = readTimeout("timeout.connection.media.api",    defaultConnectionTimeout)
  val mediaApiReadTimeout    = readTimeout("timeout.read.media.api",          defaultReadTimeout)

  def mediaConfig(env: String): MediaConfig = try {
    val apiKey    = properties(s"media.$env.apiKey")
    val loaderUrl = properties(s"media.$env.loaderUrl")
    val usageUrl  = properties(s"media.$env.usageUrl")
    MediaConfig(apiKey, loaderUrl, usageUrl)
  } catch {
    case _: Throwable => throw new Error(s"Invalid media environment name: $env")
  }

}
