package com.gu.mediaservice.scripts

import scala.collection.JavaConverters._

import org.apache.http.impl.client.HttpClients
import org.apache.http.client.methods.HttpPost
import org.apache.http.entity.{ContentType, InputStreamEntity}

import com.gu.mediaservice.lib.aws.S3
import com.gu.mediaservice.lib.UserCredentials

object LoadFromS3Bucket {

  def apply(args: List[String]) {

    val (bucket, loaderEndpoint) = args match {
      case List(b, l) => (b, l)
      case _ => sys.error("Usage: LoadFromS3Bucket <bucket name> <loader endpoint>")
    }

    val credentials = UserCredentials.awsCredentials

    val s3 = new S3(credentials)

    val keys = s3.client.listObjects(bucket).getObjectSummaries.asScala.map(_.getKey)

    val httpClient = HttpClients.createDefault

    for (key <- keys) {
      val obj = s3.client.getObject(bucket, key)
      val postReq = new HttpPost(loaderEndpoint)
      val length = obj.getObjectMetadata.getContentLength
      val entity = new InputStreamEntity(obj.getObjectContent, length, ContentType.DEFAULT_BINARY)
      postReq.setEntity(entity)
      httpClient.execute(postReq).close()
      println(s"Loaded image $key")
    }

  }

}
