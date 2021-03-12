package com.gu.mediaservice.scripts

import java.io._

import com.amazonaws.auth.profile.ProfileCredentialsProvider
import org.apache.commons.compress.compressors.bzip2.{BZip2CompressorInputStream, BZip2CompressorOutputStream}
import play.api.libs.json.Json

import scala.io.Source

import com.amazonaws.regions.Regions
import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.AmazonS3ClientBuilder


object EnactS3Changes {

  private val profile = "media-service"
  private val credentials = new ProfileCredentialsProvider(profile)
  private val s3: AmazonS3 = AmazonS3ClientBuilder.standard().withCredentials(credentials).withRegion(Regions.DEFAULT_REGION).build

  def apply(args: List[String]): Unit = {
    args match {
      case bucketName :: inputFileName :: Nil => enactS3Changes(
        bucketName,
        new File(inputFileName)
      )
      case _ => throw new IllegalArgumentException("Usage: ProposeS3Changes <bucketMetadataFile> <esMetadataFile> <outputFilePrefix>")
    }
  }

  def getBzipWriter(outputFile: File) = {
    val fileOutputStream = new FileOutputStream(outputFile)
    val compressOutputStream = new BZip2CompressorOutputStream(fileOutputStream)
    val sw = new OutputStreamWriter(compressOutputStream)
    new BufferedWriter(sw)
  }

  def enactS3Changes(
                        bucketName: String,
                        inputFile: File) = {
    withSourceFromBzipFile(inputFile) {source =>
      source
        .getLines()
        .take(4)
        .flatMap(line => (Json.parse(line) \ "proposed").asOpt[ObjectMetadata])
        .zipWithIndex
        .foreach { case (metadata, i) =>
          if (i % 10000 == 0) System.err.println(s"Processing object metadata line $i")
          val key = metadata.key
          println(key)
          println(s3.getObjectMetadata(bucketName, key).getUserMetadata)
          println(metadata)
        }
    }
  }

  private def withSourceFromBzipFile[T](file: File)(f: Source => T) = {
    val fileInputStream = new FileInputStream(file)
    val compressInputStream = new BZip2CompressorInputStream(fileInputStream)
    val source = Source.fromInputStream(compressInputStream)
    try {
      f(source)
    } finally {
      source.close()
    }
  }
}
