package com.gu.mediaservice.scripts.key

import com.gu.mediaservice.lib.auth.{ApiKeyConfig, Developer, ReadOnly}

import java.time.Instant

object CreateExpiredKey extends App {
  val s3Bucket = "media-service-test-keybucket-10m1zzwqi73xd"

  val s3Client = new S3(s3Bucket)

  val apiKeyConfig = ApiKeyConfig("expired-key", ReadOnly, Some(Instant.now().minusSeconds(60 * 60 * 24)), Developer)

  val key = KeyGenerator.randomKey()
  s3Client.upload(key, apiKeyConfig)
}
