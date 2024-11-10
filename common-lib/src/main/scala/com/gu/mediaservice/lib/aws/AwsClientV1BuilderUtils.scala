package com.gu.mediaservice.lib.aws

import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.auth.{AWSCredentialsProvider, AWSCredentialsProviderChain, EnvironmentVariableCredentialsProvider, InstanceProfileCredentialsProvider}
import com.amazonaws.client.builder.AwsClientBuilder
import com.amazonaws.client.builder.AwsClientBuilder.EndpointConfiguration
import com.gu.mediaservice.lib.logging.GridLogging
import software.amazon.awssdk.services.dynamodb.{DynamoDbAsyncClient, DynamoDbAsyncClientBuilder, DynamoDbClient, DynamoDbClientBuilder}

trait AwsClientV1BuilderUtils extends GridLogging {
  def awsLocalEndpoint: Option[String]
  def isDev: Boolean

  def awsRegion: String = "eu-west-1"

  def awsCredentials: AWSCredentialsProvider = new AWSCredentialsProviderChain(
    new EnvironmentVariableCredentialsProvider(),
  )

  final def awsEndpointConfiguration: Option[EndpointConfiguration] = awsLocalEndpoint match {
    case Some(endpoint) if isDev => Some(new EndpointConfiguration(endpoint, awsRegion))
    case _ => None
  }

  final def withAWSCredentials[T, S <: AwsClientBuilder[S, T]](builder: AwsClientBuilder[S, T], localstackAware: Boolean = true, maybeRegionOverride: Option[String] = None): S = {
    awsEndpointConfiguration match {
      case Some(endpointConfiguration) if localstackAware => {
        logger.info(s"creating aws client with local endpoint $endpointConfiguration")
        builder.withCredentials(awsCredentials).withEndpointConfiguration(endpointConfiguration)
      }
      case _ => builder.withCredentials(awsCredentials).withRegion(maybeRegionOverride.getOrElse(awsRegion))
    }
  }

  final def dynamoDBV2Builder(): DynamoDbClientBuilder = {
    val e = software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider.create()
    DynamoDbClient.builder().region(software.amazon.awssdk.regions.Region.EU_WEST_1).credentialsProvider(e)
  }

  final def dynamoDBAsyncV2Builder(): DynamoDbAsyncClientBuilder = {
    val e = software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider.create()
    DynamoDbAsyncClient.builder().region(software.amazon.awssdk.regions.Region.EU_WEST_1).credentialsProvider(e)
  }
}
