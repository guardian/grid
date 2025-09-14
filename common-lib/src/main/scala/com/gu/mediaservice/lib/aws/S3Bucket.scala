package com.gu.mediaservice.lib.aws

import java.net.URI

case class S3Bucket(bucket: String, endpoint: String) {
  def objectUrl(key: String): URI = {
    val s3Endpoint = endpoint
    val bucketName = bucket
    val bucketUrl = if (s3Endpoint == "minio.griddev.eelpieconsulting.co.uk") {
      new URI(s"http://$s3Endpoint/$bucketName/$key")
    } else {
      val bucketHost = s"$bucketName.$s3Endpoint"
      new URI("http", bucketHost, s"/$key", null)
    }
    bucketUrl
  }

}
