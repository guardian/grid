package com.gu.mediaservice.lib.config

import java.io.File
import scala.io.Source._
import play.api.Play


trait Config {

  val awsEndpoint = "ec2.eu-west-1.amazonaws.com"

  val elasticsearchRole = "media-service-elasticsearch"

  val appConfig = Play.current.configuration

  def apply(key: String): String =
    string(key)

  def string(key: String): String =
    appConfig.getString(key) getOrElse missing(key, "string")

  def int(key: String): Int =
    appConfig.getInt(key) getOrElse missing(key, "integer")

  val stage: String = stageFromFile getOrElse "DEV"

  private def missing(key: String, type_ : String): Nothing =
    sys.error(s"Required $type_ configuration property missing: $key")

  protected def stageFromFile: Option[String] = {
    val file = new File("/etc/gu/stage")
    if (file.exists) Some(fromFile(file).mkString.trim) else None
  }

}
