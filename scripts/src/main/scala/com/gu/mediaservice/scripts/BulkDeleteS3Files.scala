package com.gu.mediaservice.scripts

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.{Delete, DeleteObjectsRequest, ObjectIdentifier}

import java.io.{File, PrintWriter}
import scala.io.Source
import scala.jdk.CollectionConverters.iterableAsScalaIterableConverter

object BulkDeleteS3Files {

  private val profile = "media-service"
  private val region = Region.EU_WEST_1
  private val credentials = DefaultCredentialsProvider.builder.profileName(profile).build
  private val s3: S3Client = S3Client.builder
    .region(region)
    .credentialsProvider(credentials)
    .build
  def apply(args: List[String]): Unit = {
    args match {
      case bucketName :: inputFileName :: auditFileName :: _ =>
        apply(bucketName, inputFileName, auditFileName)
      case _ => throw new IllegalArgumentException("Usage: BulkDeleteS3Files <bucketName> <inputFile> <auditFile>")
    }
  }

  def apply(bucketName: String, inputFileName: String, auditFileName: String) = {

    val inputFileSource = Source.fromFile(inputFileName)
    val auditFileWriter = new PrintWriter(new File(auditFileName))
    auditFileWriter.println("path, result")
    try {
      for {
        bucketKeys <- inputFileSource.getLines().drop(1 /* column heading */).grouped(1000).toList
        objectIdentifiers = bucketKeys.map(key => ObjectIdentifier.builder().key(key.trim().drop(1).dropRight(1)).build())
        batchResult = s3.deleteObjects(
          DeleteObjectsRequest.builder()
            .bucket(bucketName)
            .delete(
              Delete.builder()
                .objects(objectIdentifiers:_*)
                .quiet(false) // so we get success back too
                .build()
            )
            .build()
        )
        successfulDeletesLogLines = batchResult.deleted().asScala.map{ deletedObject =>
          s"${deletedObject.key()}, DELETED"
        }
        failedDeletesLogLines = batchResult.errors().asScala.map{ error =>
          s"${error.key()}, FAILED, ${error.code()}, ${error.message()}"
        }
        logLines = successfulDeletesLogLines ++ failedDeletesLogLines
        unit = logLines.foreach {logLine =>
          println(logLine)
          auditFileWriter.println(logLine)
        }
      } yield unit
    }
    finally {
      inputFileSource.close()
      auditFileWriter.close()
    }

  }

}
