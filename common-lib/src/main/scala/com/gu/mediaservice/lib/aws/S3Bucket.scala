package com.gu.mediaservice.lib.aws

import java.net.URI

case class S3Bucket(bucket: String, endpoint: String) {
  def objectUrl(key: String): URI = {
    val s3Endpoint = endpoint
    val bucketName = bucket
    val bucketUrl = if (isPathStyleURLs(s3Endpoint)) {
      new URI(s"http://$s3Endpoint/$bucketName/$key")
    } else {
      val bucketHost = s"$bucketName.$s3Endpoint"
      new URI("http", bucketHost, s"/$key", null)
    }
    bucketUrl
  }

  def keyFromS3URL(url: URI): String = {
    if (isPathStyleURLs(endpoint)) {
      url.getPath.drop(bucket.length + 2)
    } else {
      url.getPath.drop(1)
    }
  }

  private def isPathStyleURLs(s3Endpoint: String) = {
    s3Endpoint == "minio.griddev.eelpieconsulting.co.uk"
  }

}
