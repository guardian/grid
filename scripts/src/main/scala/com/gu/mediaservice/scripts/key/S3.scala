package com.gu.mediaservice.scripts.key

import com.gu.mediaservice.lib.auth.ApiKeyConfig
import com.gu.mediaservice.scripts.key.CreateKeyV2.{s3Bucket, s3Client}
import play.api.libs.json.Json
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.{PutObjectRequest, Tag, Tagging}

import java.time.{Duration, Instant}

class S3(bucket: String) {

  private val s3 = S3Client.builder
    .region(Region.EU_WEST_1)
    .credentialsProvider(DefaultCredentialsProvider.builder.profileName("media-service").build)
    .build

  def upload(key: String, config: ApiKeyConfig): Unit = {

    val ttlDays = config.expiry.map(expiry => {
      math.ceil(Duration.between(Instant.now(), expiry).toMinutes / 1440.0).toLong
    })

    def buildTag(ttlDays: Long): Tagging = {
      val tag = Tag.builder().key("ttl").value(ttlDays.toString).build()
      Tagging.builder().tagSet(tag).build()
    }

    val base = PutObjectRequest.builder()
      .bucket(bucket)
      .key(s"${config.name}-$key")

    val request = (ttlDays match {
      case Some(days) => base.tagging(buildTag(days))
      case None       => base
    }).build()

    val body = RequestBody.fromString(Json.stringify(Json.toJson(config)))

    s3.putObject(request, body)
  }

}
