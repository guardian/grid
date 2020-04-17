package com.gu.mediaservice.lib.aws

import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.auth.{AWSCredentialsProvider, AWSCredentialsProviderChain, InstanceProfileCredentialsProvider}
import com.amazonaws.client.builder.AwsClientBuilder
import com.amazonaws.client.builder.AwsClientBuilder.EndpointConfiguration
import play.api.Logger

trait AwsClientBuilderUtils {
  def awsLocalEndpoint: Option[String]

  def awsRegion: String = "eu-west-1"

  def awsCredentials: AWSCredentialsProvider = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("media-service"),
    InstanceProfileCredentialsProvider.getInstance()
  )

  def awsEndpointConfiguration: Option[EndpointConfiguration] = awsLocalEndpoint match {
    case Some(endpoint) => Some(new EndpointConfiguration(endpoint, awsRegion))
    case _ => None
  }

  // TODO consolidate `withAWSCredentials` with `withLocalAWSCredentials`. Requires use of localstack everywhere (Dynamo, S3, Kinesis)
  def withAWSCredentials__DEPRECATED[T, S <: AwsClientBuilder[S, T]](builder: AwsClientBuilder[S, T]): S = builder
    .withRegion(awsRegion)
    .withCredentials(awsCredentials)

  def withAWSCredentials[T, S <: AwsClientBuilder[S, T]](builder: AwsClientBuilder[S, T]): S = {
    awsEndpointConfiguration match {
      case Some(endpointConfiguration) => {
        Logger.info(s"creating aws client with local endpoint $endpointConfiguration")
        builder.withCredentials(awsCredentials).withEndpointConfiguration(endpointConfiguration)
      }
      case _ => builder.withCredentials(awsCredentials).withRegion(awsRegion)
    }
  }
}
