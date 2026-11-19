package com.gu.mediaservice.scripts.key

import com.gu.mediaservice.lib.auth._


object CreateKeyV2 extends App {

  val s3Bucket = sys.env.getOrElse("API_KEY_BUCKET", throw new RuntimeException("API_KEY_BUCKET environment variable not set"))

  val s3Client = new S3(s3Bucket)

  val parsed = KeyArgs.parse(args)
  val apiKeyConfig = ApiKeyConfig(parsed.name, parsed.permissions, parsed.principalType, parsed.expiryDays)

  val key = KeyGenerator.randomKey()
  s3Client.upload(key, apiKeyConfig)

}
