package com.gu.mediaservice.scripts

import java.nio.file.Paths
import scala.collection.JavaConverters._

import org.apache.http.impl.client.HttpClients
import org.apache.http.client.methods.HttpPost
import org.apache.http.entity.{ContentType, InputStreamEntity}
import com.amazonaws.auth.BasicAWSCredentials

import com.gu.mediaservice.lib.config.Properties
import com.gu.mediaservice.lib.aws.S3


object LoadFromS3Bucket extends App {

  val (bucket, loaderEndpoint) = args match {
    case Array(_, b, l) => (b, l)
    case _ => sys.error("Usage: LoadFromS3Bucket <bucket name> <loader endpoint>")
  }

  val awsKeyFile = Paths.get(sys.props("user.home")).resolve(".awstools/cfn/myAWSCredentials.txt")
  val credentials = Properties.fromFile(awsKeyFile.toFile)

  val s3 = new S3(new BasicAWSCredentials(credentials("AWSAccessKeyId"), credentials("AWSSecretKey")))

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
