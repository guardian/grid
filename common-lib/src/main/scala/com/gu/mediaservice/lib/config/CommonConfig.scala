package com.gu.mediaservice.lib.config

import java.io.File
import java.util.UUID

import com.amazonaws.auth.{AWSCredentialsProvider, AWSCredentialsProviderChain, InstanceProfileCredentialsProvider}
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import play.api.Configuration

import scala.io.Source._


trait CommonConfig {
  def appName: String
  def configuration: Configuration
  def properties: Map[String, String]

  final val awsEndpoint = "ec2.eu-west-1.amazonaws.com"
  final val elasticsearchStack = "media-service"
  final val elasticsearchApp   = "elasticsearch"
  final val stackName          = "media-service"

  final val sessionId = UUID.randomUUID().toString()

  final val awsCredentials: AWSCredentialsProvider = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("media-service"),
    InstanceProfileCredentialsProvider.getInstance()
  )

  // Note: had to make these lazy to avoid init order problems ;_;
  lazy val ssl: Boolean = properties.get("ssl").map(_.toBoolean).getOrElse(true)
  lazy val domainRoot: String = properties("domain.root")

  lazy val services = new Services(domainRoot, ssl)

  private lazy val corsAllowedOrigins = properties.getOrElse("cors.allowed.origins", "").split(",").toList
  val corsAllAllowedOrigins = services.kahunaBaseUri :: corsAllowedOrigins

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
