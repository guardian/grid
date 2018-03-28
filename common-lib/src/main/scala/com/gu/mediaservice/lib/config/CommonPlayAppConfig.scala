package com.gu.mediaservice.lib.config

import java.io.File
import java.util.UUID

import play.api.Configuration

import scala.io.Source._


trait CommonPlayAppConfig {

  val appName: String
  val configuration: Configuration
  val properties: Map[String, String]

  final val awsEndpoint = "ec2.eu-west-1.amazonaws.com"
  final val elasticsearchStack = "media-service"
  final val elasticsearchApp   = "elasticsearch"
  final val stackName          = "media-service"

  final val sessionId = UUID.randomUUID().toString()

  final def apply(key: String): String =
    string(key)

  final def string(key: String): String =
    configuration.getOptional[String](key) getOrElse missing(key, "string")

  final def int(key: String): Int =
    configuration.getOptional[Int](key) getOrElse missing(key, "integer")

  final val stage: String = stageFromFile getOrElse "DEV"

  private def missing(key: String, type_ : String): Nothing =
    sys.error(s"Required $type_ configuration property missing: $key")

  private def stageFromFile: Option[String] = {
    val file = new File("/etc/gu/stage")
    if (file.exists) Some(fromFile(file).mkString.trim) else None
  }

}
