package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.logging.GridLogging
import software.amazon.awssdk.auth.credentials.{AwsCredentialsProvider, DefaultCredentialsProvider}
import software.amazon.awssdk.awscore.client.builder.AwsClientBuilder
import software.amazon.awssdk.regions.Region

import java.net.URI

trait AwsClientBuilderUtils extends GridLogging {
  def awsLocalEndpointUri: Option[URI]
  def isDev: Boolean

  def awsRegion: Region = Region.EU_WEST_1

  def awsCredentials: AwsCredentialsProvider = DefaultCredentialsProvider.builder().profileName("media-service").build()

  final def withAWSCredentials[T, S <: AwsClientBuilder[S, T]](builder: AwsClientBuilder[S, T], localstackAware: Boolean = true, maybeRegionOverride: Option[Region] = None): S = {
    val credentialedBuilder = builder.credentialsProvider(awsCredentials).region(maybeRegionOverride.getOrElse(awsRegion))

    awsLocalEndpointUri match {
      case Some(endpoint) if localstackAware =>
        logger.info(s"creating aws client with local endpoint $endpoint")
        credentialedBuilder.endpointOverride(endpoint)
      case _ => credentialedBuilder
    }
  }
}
