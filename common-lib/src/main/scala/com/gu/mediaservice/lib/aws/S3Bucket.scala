package com.gu.mediaservice.lib.aws

import java.net.URI

case class S3Bucket(bucket: String, endpoint: String, usesPathStyleURLs: Boolean) {
  def objectUrl(key: String): URI = {
    val s3Endpoint = endpoint
    val bucketName = bucket
    val bucketUrl = if (usesPathStyleURLs) {
      new URI(s"http://$s3Endpoint/$bucketName/$key")
    } else {
      val bucketHost = s"$bucketName.$s3Endpoint"
      new URI("http", bucketHost, s"/$key", null)
    }
    bucketUrl
  }

  def keyFromS3URL(url: URI): String = {
    if (usesPathStyleURLs) {
      url.getPath.drop(bucket.length + 2)
    } else {
      url.getPath.drop(1)
    }
  }

}
