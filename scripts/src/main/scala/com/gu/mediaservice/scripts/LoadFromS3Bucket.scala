package com.gu.mediaservice.scripts

import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.auth.{AWSCredentialsProviderChain, InstanceProfileCredentialsProvider}
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import org.apache.http.client.methods.HttpPost
import org.apache.http.entity.{ContentType, InputStreamEntity}
import org.apache.http.impl.client.HttpClients

import scala.collection.JavaConverters._

object LoadFromS3Bucket {

  def apply(args: List[String]) {

    val (bucket, loaderEndpoint) = args match {
      case List(b, l) => (b, l)
      case _ => sys.error("Usage: LoadFromS3Bucket <bucket name> <loader endpoint>")
    }

    lazy val awsCredentials = new AWSCredentialsProviderChain(
      new ProfileCredentialsProvider("media-service"),
      InstanceProfileCredentialsProvider.getInstance()
    )

    val client = AmazonS3ClientBuilder.standard().withCredentials(awsCredentials).build()

    val keys = client.listObjects(bucket).getObjectSummaries.asScala.map(_.getKey)

    val httpClient = HttpClients.createDefault

    for (key <- keys) {
      val obj = client.getObject(bucket, key)
      val postReq = new HttpPost(loaderEndpoint)
      val length = obj.getObjectMetadata.getContentLength
      val entity = new InputStreamEntity(obj.getObjectContent, length, ContentType.DEFAULT_BINARY)
      postReq.setEntity(entity)
      httpClient.execute(postReq).close()
      println(s"Loaded image $key")
    }

  }

}
