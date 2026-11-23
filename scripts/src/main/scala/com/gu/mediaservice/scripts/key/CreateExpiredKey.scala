package com.gu.mediaservice.scripts.key

import com.gu.mediaservice.auth.Permissions
import com.gu.mediaservice.lib.auth.{ApiKeyConfig, Developer, ReadOnly}

import java.time.Instant

object CreateExpiredKey extends App {
  val s3Bucket = sys.env.getOrElse("API_KEY_BUCKET", throw new RuntimeException("API_KEY_BUCKET environment variable not set"))

  val s3Client = new S3(s3Bucket)

  val apiKeyConfig = ApiKeyConfig("expired-key", Seq(Permissions.EditMetadata), Some(Instant.now().minusSeconds(60 * 60 * 24)), Developer)

  val key = KeyGenerator.randomKey()
  s3Client.upload(key, apiKeyConfig, None)
}
