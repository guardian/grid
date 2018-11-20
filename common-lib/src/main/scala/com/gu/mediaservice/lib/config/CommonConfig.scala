package com.gu.mediaservice.lib.config

import java.io.File
import java.util.UUID

import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.auth.{AWSCredentialsProviderChain, InstanceProfileCredentialsProvider}
import com.amazonaws.client.builder.AwsClientBuilder

import scala.io.Source._


trait CommonConfig {
  def appName: String

  lazy val properties: Map[String, String] = Properties.fromPath(s"/etc/gu/$appName.properties")

  final val awsEndpoint = "ec2.eu-west-1.amazonaws.com"
  final val elasticsearchStack = "media-service"
  final val elasticsearchApp = "elasticsearch"
  final val stackName = "media-service"

  final val sessionId = UUID.randomUUID().toString

  lazy val awsCredentials = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("media-service"),
    InstanceProfileCredentialsProvider.getInstance()
  )

  lazy val awsRegion = properties.getOrElse("aws.region", "eu-west-1")

  def withAWSCredentials[T, S <: AwsClientBuilder[S, T]](builder: AwsClientBuilder[S, T]): S = builder
    .withRegion(awsRegion)
    .withCredentials(awsCredentials)

  final val stage: String = stageFromFile getOrElse "DEV"

  val isProd: Boolean = stage == "PROD"
  val isDev: Boolean = stage == "DEV"

  // Note: had to make these lazy to avoid init order problems ;_;
  lazy val domainRoot: String = properties("domain.root")
  lazy val services = new Services(domainRoot, isProd)

  private def stageFromFile: Option[String] = {
    val file = new File("/etc/gu/stage")
    if (file.exists) Some(fromFile(file).mkString.trim) else None
  }
}
