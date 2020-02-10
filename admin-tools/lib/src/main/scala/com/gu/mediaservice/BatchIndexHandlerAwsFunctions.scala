package com.gu.mediaservice

import java.io.ByteArrayInputStream
import java.nio.ByteBuffer
import java.util.UUID

import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.auth.{AWSCredentialsProviderChain, EnvironmentVariableCredentialsProvider}
import com.amazonaws.client.builder.AwsClientBuilder.EndpointConfiguration
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClient
import com.amazonaws.services.dynamodbv2.document.{Table, DynamoDB => AwsDynamoDB}
import com.amazonaws.services.kinesis.model.PutRecordRequest
import com.amazonaws.services.kinesis.{AmazonKinesis, AmazonKinesisClientBuilder}
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.amazonaws.services.s3.model.ObjectMetadata
import com.gu.mediaservice.lib.aws.{BulkIndexRequest, UpdateMessage}
import com.gu.mediaservice.lib.json.JsonByteArrayUtil
import play.api.libs.json.JsValue

class BatchIndexHandlerAwsFunctions(cfg: BatchIndexHandlerConfig) {

  private val AwsRegion = "eu-west-1"
  private val s3client = buildS3Client
  private val kinesis = buildKinesisClient

  private lazy val awsCredentials = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("media-service"),
    new EnvironmentVariableCredentialsProvider()
  )

  import cfg._

  def putToS3(imageBlobs: List[String]): BulkIndexRequest = {
    val fileContent = imageBlobs.mkString("\n")
    val key = s"batch-index/${UUID.randomUUID().toString}.json"
    val metadata = new ObjectMetadata
    metadata.setContentType("application/json")
    val res = s3client.putObject(batchIndexBucket, key, new ByteArrayInputStream(fileContent.getBytes), metadata)
    println(s"PUT [s3://$batchIndexBucket/$key] object to s3 response: $res")
    BulkIndexRequest(batchIndexBucket, key)
  }

  def putToKinensis(message: UpdateMessage): Unit = {
    println("attempting to put message to kinesis")
    val payload = JsonByteArrayUtil.toByteArray(message)
    val partitionKey = UUID.randomUUID().toString
    val data = ByteBuffer.wrap(payload)
    val putReq = new PutRecordRequest()
      .withStreamName(kinesisStreamName)
      .withPartitionKey(partitionKey)
      .withData(data)

    val res = kinesis.putRecord(putReq)
    println(s"PUT [$message] message to kinesis stream: $kinesisStreamName response: $res")
  }

  private def buildS3Client = {
    val builder = AmazonS3ClientBuilder.standard().withRegion(AwsRegion)
    builder.withCredentials(awsCredentials).build()
  }

  def buildDynamoTableClient: Table = {
    val builder = AmazonDynamoDBClient.builder()
      .withRegion(AwsRegion)
      .withCredentials(awsCredentials)
    val dynamo = new AwsDynamoDB(builder.build())
    dynamo.getTable(dynamoTableName)
  }

  private def buildKinesisClient: AmazonKinesis = {
    val baseBuilder = AmazonKinesisClientBuilder.standard()
    val builder = kinesisEndpoint match {
      case Some(uri) =>
        println(s"building local kinesis client with $uri")
        baseBuilder.withEndpointConfiguration(new EndpointConfiguration(uri, AwsRegion))
      case _ =>
        println("building remote kinesis client")
        baseBuilder.withRegion(AwsRegion)
    }
    builder.withCredentials(awsCredentials).build()
  }

}
