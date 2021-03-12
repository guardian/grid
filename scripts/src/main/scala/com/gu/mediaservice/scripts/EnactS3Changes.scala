package com.gu.mediaservice.scripts

import java.io._

import com.amazonaws.auth.profile.ProfileCredentialsProvider
import org.apache.commons.compress.compressors.bzip2.{BZip2CompressorInputStream, BZip2CompressorOutputStream}
import play.api.libs.json.Json

import scala.io.Source
import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.amazonaws.services.s3.model.CopyObjectRequest
import collection.JavaConverters._

object EnactS3Changes {

  private val profile = "media-service"
  private val region = "eu-west-1"
  private val credentials = new ProfileCredentialsProvider(profile)
  private val s3: AmazonS3 = AmazonS3ClientBuilder.standard().withCredentials(credentials).withRegion(region).build

  def apply(args: List[String]): Unit = {
    args match {
      case bucketName :: inputFileName :: Nil => enactS3Changes(
        bucketName,
        new File(inputFileName)
      )
      case _ => throw new IllegalArgumentException("Usage: EnactS3Changes <bucketName> <inputFile>")
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
        .take(1)
        .flatMap(line => (Json.parse(line) \ "proposed").asOpt[ObjectMetadata])
        .zipWithIndex
        .foreach { case (metadata, i) =>
          if (i % 10000 == 0) System.err.println(s"Processing object metadata line $i")
          val key = metadata.key
          val awsObjectMetadata = s3.getObjectMetadata(bucketName, key)
          awsObjectMetadata.setUserMetadata(metadata.metadata.asJava)
          val request = new CopyObjectRequest(bucketName, key, bucketName, key).withNewObjectMetadata(awsObjectMetadata)
          try {
            s3.copyObject(request)
          } catch {
            case e => System.err.println(e.getMessage)
          }
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
