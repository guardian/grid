package com.gu.mediaservice.lib.aws

import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.auth.{AWSCredentialsProvider, AWSCredentialsProviderChain, InstanceProfileCredentialsProvider}
import com.amazonaws.client.builder.AwsClientBuilder
import com.amazonaws.client.builder.AwsClientBuilder.EndpointConfiguration
import com.gu.mediaservice.lib.logging.GridLogging
trait AwsClientBuilderUtils extends GridLogging {
  def awsLocalEndpoint: Option[String]
  def isDev: Boolean

  def awsRegion: String = "eu-west-1"

  def awsCredentials: AWSCredentialsProvider = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("media-service"),
    InstanceProfileCredentialsProvider.getInstance()
  )

  final def awsEndpointConfiguration: Option[EndpointConfiguration] = awsLocalEndpoint match {
    case Some(endpoint) if isDev => Some(new EndpointConfiguration(endpoint, awsRegion))
    case _ => None
  }

  final def withAWSCredentials[T, S <: AwsClientBuilder[S, T]](builder: AwsClientBuilder[S, T], localstackAware: Boolean = true): S = {
    awsEndpointConfiguration match {
      case Some(endpointConfiguration) if localstackAware => {
        logger.info(s"creating aws client with local endpoint $endpointConfiguration")
        builder.withCredentials(awsCredentials).withEndpointConfiguration(endpointConfiguration)
      }
      case _ => builder.withCredentials(awsCredentials).withRegion(awsRegion)
    }
  }
}
