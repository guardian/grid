package com.gu.mediaservice.scripts


import org.apache.commons.compress.compressors.bzip2.BZip2CompressorOutputStream
import org.joda.time.DateTime
import play.api.libs.json.Json
import software.amazon.awssdk.auth.credentials.{DefaultCredentialsProvider, ProfileCredentialsProvider}
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.{HeadObjectRequest, ListObjectsV2Request}

import java.io.{BufferedWriter, File, FileOutputStream, FileWriter, OutputStreamWriter}
import java.time.Instant
import scala.collection.JavaConverters.{asScalaIteratorConverter, iterableAsScalaIterableConverter, mapAsScalaMapConverter}

case class ObjectMetadata(key: String, lastModified: Instant, metadata: Map[String, String])
object ObjectMetadata {
  implicit val format = Json.format[ObjectMetadata]
}

/**
  * Dump selected metadata for all objects in a bucket.
  * Given a bucket and an output file this will create a JSON line per object containing the key, lastModified time and
  * user metadata.
  */
object BucketMetadata {
  def apply(args: List[String]): Unit = {
    args match {
      case bucketName :: fileName :: Nil => bucketMetadata(bucketName, new File(fileName))
      case _ => throw new IllegalArgumentException("Usage: BucketMetadata <bucket> <outputFilename.jsonl.bz2>")
    }
  }

  def bucketMetadata(bucketName: String, outputFile: File) = {
    val fileOutputStream = new FileOutputStream(outputFile)
    val compressOutputStream = new BZip2CompressorOutputStream(fileOutputStream)
    val sw = new OutputStreamWriter(compressOutputStream)
    System.err.println(s"Output encoding: ${sw.getEncoding}")
    val stream = new BufferedWriter(sw)

    try {
      val s3: S3Client = S3Client.builder
        .region(Region.EU_WEST_1)
        .credentialsProvider(DefaultCredentialsProvider.builder.profileName("media-service").build)
        .build

      val results = s3.listObjectsV2Paginator(ListObjectsV2Request.builder.bucket(bucketName).build)
      results.iterator().asScala.flatMap { results =>
        results.contents().asScala
      }.map { s3Object =>
        val headObjectResponse = s3.headObject(HeadObjectRequest.builder.bucket(bucketName).key(s3Object.key).build)
        s3Object -> headObjectResponse
      }.map { case (s3Object, metadata) =>
        ObjectMetadata(s3Object.key, metadata.lastModified, metadata.metadata.asScala.toMap)
      }.map { md =>
        Json.stringify(Json.toJson(md))
      }.zipWithIndex
       .foreach { case (json, idx) =>
        if (idx % 1000 == 0) System.err.println(s"${DateTime.now.toString}: ${idx}")
        stream.write(json)
        stream.newLine()
        stream.flush()
      }
    } finally {
      stream.close()
    }
  }
}
