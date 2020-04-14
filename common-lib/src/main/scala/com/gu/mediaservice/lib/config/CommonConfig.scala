package com.gu.mediaservice.lib.config

import java.io.File
import java.util.UUID

import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.auth.{AWSCredentialsProviderChain, InstanceProfileCredentialsProvider}
import com.amazonaws.client.builder.AwsClientBuilder
import play.api.Configuration

import scala.io.Source._
import scala.util.Try


trait CommonConfig {
  def appName: String
  def configuration: Configuration

  lazy val properties: Map[String, String] = Properties.fromPath(s"/etc/gu/$appName.properties")

  final val awsEndpoint = "ec2.eu-west-1.amazonaws.com"

  final val elasticsearchStack = "media-service"

  final val elasticsearchApp = "elasticsearch"
  final val elasticsearch6App = "elasticsearch6"

  final val stackName = "media-service"

  final val sessionId = UUID.randomUUID().toString

  final val awsRegion = properties.getOrElse("aws.region", "eu-west-1")

  final val kinesisAWSEndpoint = s"kinesis.$awsRegion.amazonaws.com"

  final val dynamodbAWSEndpoint = s"dynamodb.$awsRegion.amazonaws.com"

  lazy val awsCredentials = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("media-service"),
    InstanceProfileCredentialsProvider.getInstance()
  )

  lazy val authKeyStoreBucket = properties("auth.keystore.bucket")

  lazy val permissionsBucket = properties.getOrElse("permissions.bucket", "permissions-cache")

  def withAWSCredentials[T, S <: AwsClientBuilder[S, T]](builder: AwsClientBuilder[S, T]): S = builder
    .withRegion(awsRegion)
    .withCredentials(awsCredentials)

  final val stage: String = stageFromFile getOrElse "DEV"

  val isProd: Boolean = stage == "PROD"
  val isDev: Boolean = stage == "DEV"

  val localLogShipping: Boolean = sys.env.getOrElse("LOCAL_LOG_SHIPPING", "false").toBoolean

  lazy val thrallKinesisStream = properties("thrall.kinesis.stream.name")

  lazy val thrallKinesisEndpoint: String = properties.getOrElse("thrall.local.kinesis.url", kinesisAWSEndpoint)

  lazy val thrallKinesisDynamoEndpoint: String = properties.getOrElse("thrall.local.dynamodb.url", dynamodbAWSEndpoint)

  // Note: had to make these lazy to avoid init order problems ;_;
  lazy val domainRoot: String = properties("domain.root")
  lazy val rootAppName: String = properties.getOrElse("app.name.root", "media")
  lazy val serviceHosts = ServiceHosts(
    stringDefault("hosts.kahunaPrefix", s"$rootAppName."),
    stringDefault("hosts.apiPrefix", s"api.$rootAppName."),
    stringDefault("hosts.loaderPrefix", s"loader.$rootAppName."),
    stringDefault("hosts.cropperPrefix", s"cropper.$rootAppName."),
    stringDefault("hosts.adminToolsPrefix", s"admin-tools.$rootAppName."),
    stringDefault("hosts.metadataPrefix", s"$rootAppName-metadata."),
    stringDefault("hosts.imgopsPrefix", s"$rootAppName-imgops."),
    stringDefault("hosts.usagePrefix", s"$rootAppName-usage."),
    stringDefault("hosts.collectionsPrefix", s"$rootAppName-collections."),
    stringDefault("hosts.leasesPrefix", s"$rootAppName-leases."),
    stringDefault("hosts.authPrefix", s"$rootAppName-auth.")
  )

  lazy val corsAllowedOrigins: Set[String] = getStringSetFromProperties("security.cors.allowedOrigins")

  lazy val services = new Services(domainRoot, serviceHosts, corsAllowedOrigins)

  final def getStringSetFromProperties(key: String): Set[String] = Try(
    properties(key).split(",").map(_.trim).toSet
  ).getOrElse(Set.empty)

  final def apply(key: String): String =
    string(key)

  final def string(key: String): String =
    configuration.getOptional[String](key) getOrElse missing(key, "string")

  final def stringDefault(key: String, default: String): String =
    configuration.getOptional[String](key) getOrElse default

  final def stringOpt(key: String): Option[String] = configuration.getOptional[String](key)

  final def int(key: String): Int =
    configuration.getOptional[Int](key) getOrElse missing(key, "integer")

  private def missing(key: String, type_ : String): Nothing =
    sys.error(s"Required $type_ configuration property missing: $key")

  private def stageFromFile: Option[String] = {
    val file = new File("/etc/gu/stage")
    if (file.exists) Some(fromFile(file).mkString.trim) else None
  }
}
