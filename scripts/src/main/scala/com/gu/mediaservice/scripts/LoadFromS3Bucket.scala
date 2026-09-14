package com.gu.mediaservice.scripts

import org.apache.http.client.methods.HttpPost
import org.apache.http.entity.{ContentType, InputStreamEntity}
import org.apache.http.impl.client.HttpClients
import software.amazon.awssdk.auth.credentials.{AwsCredentialsProviderChain, InstanceProfileCredentialsProvider, ProfileCredentialsProvider}
import software.amazon.awssdk.core.ResponseInputStream
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.{GetObjectRequest, GetObjectResponse, ListObjectsV2Request}

import scala.jdk.CollectionConverters._

object LoadFromS3Bucket {

  def apply(args: List[String]): Unit = {

    val (bucket, loaderEndpoint) = args match {
      case List(b, l) => (b, l)
      case _ => sys.error("Usage: LoadFromS3Bucket <bucket name> <loader endpoint>")
    }

    lazy val awsCredentials = AwsCredentialsProviderChain.of(
      ProfileCredentialsProvider.create("media-service"),
      InstanceProfileCredentialsProvider.create()
    )

    val client: S3Client = S3Client.builder()
      .credentialsProvider(awsCredentials)
      .build()

    val keys = client.listObjectsV2(
      ListObjectsV2Request.builder().bucket(bucket).build()
    ).contents().asScala.map(_.key)

    val httpClient = HttpClients.createDefault

    for (key <- keys) {
      val getObjectRequest = GetObjectRequest.builder()
        .bucket(bucket)
        .key(key)
        .build()

      val objStream: ResponseInputStream[GetObjectResponse] = client.getObject(getObjectRequest)
      val length = objStream.response().contentLength()

      val postReq = new HttpPost(loaderEndpoint)
      val entity = new InputStreamEntity(objStream, length, ContentType.DEFAULT_BINARY)
      postReq.setEntity(entity)

      try {
        httpClient.execute(postReq).close()
      } finally {
        objStream.close()
      }

      println(s"Loaded image $key")
    }

  }

}
