package com.gu.mediaservice

import java.io.ByteArrayInputStream
import java.nio.ByteBuffer
import java.util.UUID

import com.amazonaws.client.builder.AwsClientBuilder.EndpointConfiguration
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClient
import com.amazonaws.services.dynamodbv2.document.{Table, DynamoDB => AwsDynamoDB}
import com.amazonaws.services.kinesis.model.PutRecordRequest
import com.amazonaws.services.kinesis.{AmazonKinesis, AmazonKinesisClientBuilder}
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.amazonaws.services.s3.model.ObjectMetadata
import com.gu.mediaservice.lib.json.JsonByteArrayUtil
import play.api.libs.json.JsValue

class BatchIndexHandlerAwsFunctions(cfg: BatchIndexHandlerConfig) {

  private val AwsRegion = "eu-west-1"
  private val s3client = buildS3Client
  private val kinesis = buildKinesisClient

  import cfg._

  def putToS3(imageBlobs: List[String]): String = {
    val fileContent = imageBlobs.mkString("\n")
    val key = s"batch-index/${UUID.randomUUID().toString}.json"
    val metadata = new ObjectMetadata
    metadata.setContentType("application/json")
    val res = s3client.putObject(batchIndexBucket, key, new ByteArrayInputStream(fileContent.getBytes), metadata)
    val path = s"s3://$batchIndexBucket/$key"
    println(s"PUT [$path] object to s3 response: $res")
    path
  }

  def putToKinensis(message: JsValue): Unit = {
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
    awsCreds match {
      case Some(creds) =>
        println(s"building local s3 client")
        builder.withCredentials(creds).build()
      case _ =>
        println("building remote s3 client")
        builder.build()
    }
  }

  def buildDynamoTableClient: Table = {
    val builder = AmazonDynamoDBClient.builder().withRegion(AwsRegion)
    val dynamoClient = awsCreds match {
      case Some(creds) =>
        println(s"building local dynamoDB client")
        builder.withCredentials(creds).build()
      case _ =>
        println("building remote dynamoDB client")
        builder.build()
    }
    val dynamo = new AwsDynamoDB(dynamoClient)
    dynamo.getTable(dynamoTableName)
  }

  private def buildKinesisClient: AmazonKinesis = {
    val builder = AmazonKinesisClientBuilder.standard()
    kinesisEndpoint match {
      case Some(uri) =>
        println(s"building local kinesis client with $uri")
        builder.withEndpointConfiguration(new EndpointConfiguration(uri, AwsRegion)).build()
      case _ =>
        println("building remote kinesis client")
        builder.withRegion(AwsRegion).build()
    }
  }

}
