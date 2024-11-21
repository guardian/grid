package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.logging.GridLogging
import software.amazon.awssdk.auth.credentials.{AwsCredentialsProvider, EnvironmentVariableCredentialsProvider}
import software.amazon.awssdk.awscore.client.builder.AwsClientBuilder
import software.amazon.awssdk.regions.Region

import java.net.URI

trait AwsClientV2BuilderUtils extends GridLogging {
  def awsLocalEndpointUri: Option[URI]
  def isDev: Boolean

  def awsRegionV2: Region = Region.EU_WEST_1

  def awsCredentialsV2: AwsCredentialsProvider = EnvironmentVariableCredentialsProvider.create()

  final def withAWSCredentialsV2[T, S <: AwsClientBuilder[S, T]](builder: AwsClientBuilder[S, T], localstackAware: Boolean = true, maybeRegionOverride: Option[Region] = None): S = {
    val credentialedBuilder = builder.credentialsProvider(awsCredentialsV2).region(maybeRegionOverride.getOrElse(awsRegionV2))

    awsLocalEndpointUri match {
      case Some(endpoint) if localstackAware =>
        logger.info(s"creating aws client with local endpoint $endpoint")
        credentialedBuilder.endpointOverride(endpoint)
      case _ => credentialedBuilder
    }
  }
}
