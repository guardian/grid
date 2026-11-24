package com.gu.mediaservice.scripts.key

import com.gu.mediaservice.lib.auth.ApiKeyConfig
import com.gu.mediaservice.lib.auth.{Expiry, Day, Week, Month}
import play.api.libs.json.Json
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.{GetObjectRequest, PutObjectRequest, Tag, Tagging}

import java.nio.charset.StandardCharsets

class S3(bucket: String) {

  private val s3 = S3Client.builder
    .region(Region.EU_WEST_1)
    .credentialsProvider(DefaultCredentialsProvider.builder.profileName("media-service").build)
    .build

  private  def buildTag(name: String, value: String): Tag = {
    Tag.builder().key(name).value(value).build()
  }
  private def taggging(tags: List[Tag]): Tagging = {
    Tagging.builder().tagSet(tags: _*).build()
  }
  def upload(key: String, config: ApiKeyConfig, ttl: Option[Expiry]): Unit = {

    val tags = List(buildTag("schema", "v2")) ++ ttl.map(expiry => buildTag("ttl", expiry.days.toString)).toList

    val s3key = s"${config.name}-$key"
    val request = PutObjectRequest.builder()
      .bucket(bucket)
      .key(s3key)
      .tagging(taggging(tags))
      .build()

    val body = RequestBody.fromString(Json.stringify(Json.toJson(config)))
    s3.putObject(request, body)
  }

  def getKey(key: String)= {
    val bytes = s3.getObject(GetObjectRequest.builder().key(key).bucket(bucket).build()).readAllBytes();;
    new String(bytes, StandardCharsets.UTF_8)
  }
}
