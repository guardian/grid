package com.gu.mediaservice.scripts.key

import com.gu.mediaservice.lib.auth.ApiKeyConfig
import play.api.libs.json.Json
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.{GetObjectRequest, PutObjectRequest, Tag, Tagging}

import java.nio.charset.StandardCharsets
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

    val s3key = s"${config.name}-$key"
    val base = PutObjectRequest.builder()
      .bucket(bucket)
      .key(s3key)

    val request = (ttlDays match {
      case Some(days) => base.tagging(buildTag(days))
      case None       => base
    }).build()

    val body = RequestBody.fromString(Json.stringify(Json.toJson(config)))

    s3.putObject(request, body)
    println(s"Uploaded API key $s3key to S3")
  }

  def getKey(key: String)= {
    val bytes = s3.getObject(GetObjectRequest.builder().key(key).bucket(bucket).build()).readAllBytes();;
    new String(bytes, StandardCharsets.UTF_8)
  }
}
