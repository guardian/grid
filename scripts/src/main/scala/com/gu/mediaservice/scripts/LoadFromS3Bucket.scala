package com.gu.mediaservice.scripts

import scala.collection.JavaConverters._

import org.apache.http.impl.client.HttpClients
import org.apache.http.client.methods.HttpPost
import org.apache.http.entity.{ContentType, InputStreamEntity}

import com.gu.mediaservice.lib.UserCredentials
import com.amazonaws.services.s3.AmazonS3Client

object LoadFromS3Bucket {

  def apply(args: List[String]) {

    val (bucket, loaderEndpoint) = args match {
      case List(b, l) => (b, l)
      case _ => sys.error("Usage: LoadFromS3Bucket <bucket name> <loader endpoint>")
    }

    val credentials = UserCredentials.awsCredentials

    val client = new AmazonS3Client(credentials)

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
