package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.logging.GridLogging

import java.net.URI

trait S3KeyFromURL extends GridLogging {

  def keyFromS3URL(bucket: S3Bucket, url: URI): String = {
    val key = if (bucket.endpoint == "minio.griddev.eelpieconsulting.co.uk") {
      url.getPath.drop(bucket.bucket.length + 2)
    } else {
      url.getPath.drop(1)
    }
    logger.info("Key from bucket " + bucket + " URL " + url + ": " + key)
    key
  }

}
