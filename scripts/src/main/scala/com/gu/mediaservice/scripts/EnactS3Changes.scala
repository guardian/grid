package com.gu.mediaservice.scripts

import java.io._
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import org.apache.commons.compress.compressors.bzip2.{BZip2CompressorInputStream, BZip2CompressorOutputStream}
import play.api.libs.json.{JsObject, JsValue, Json, OWrites}

import scala.io.Source
import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.amazonaws.services.s3.model.AmazonS3Exception
import org.joda.time.{DateTime, Duration}
import com.gu.mediaservice.lib.JsonValueCodecJsValue.jsValueCodec
import com.github.plokhotnyuk.jsoniter_scala.core._
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.{CopyObjectRequest, HeadObjectRequest, ListObjectsRequest, ListObjectsV2Request, MetadataDirective, NoSuchKeyException}

import collection.JavaConverters._
import scala.util.{Failure, Success, Try}

object EnactS3Changes {

  private val profile = "media-service"
  private val region = Region.EU_WEST_1
  private val credentials = DefaultCredentialsProvider.builder.profileName("media-service").build
  private val s3: S3Client = S3Client.builder
    .region(region)
    .credentialsProvider(credentials)
    .build

  def option(options: List[String], argName: String): (Option[String], List[String]) = {
    val arg = options.find(_.startsWith(s"$argName="))
    val value = arg.map(_.stripPrefix(s"$argName="))
    value -> options.filterNot(arg.contains)
  }

  def apply(args: List[String]): Unit = {
    args match {
      case bucketName :: inputFileName :: auditFileName :: options =>
        val (maybeDrop, optionsAfterDrop) = option(options, "drop")
        val (maybeTake, optionsAfterTake) = option(optionsAfterDrop, "take")
        val (maybePrefixFilter, unknownOptions) = option(optionsAfterTake, "prefixFilter")
        if (unknownOptions.nonEmpty) throw new IllegalArgumentException(s"Didn't recognise options $unknownOptions")
        enactS3Changes(
          bucketName,
          new File(inputFileName),
          new File(auditFileName),
          maybeDrop.map(_.toInt),
          maybeTake.map(_.toInt),
          maybePrefixFilter
        )
      case _ => throw new IllegalArgumentException("Usage: EnactS3Changes <bucketName> <inputFile> <auditFile> [drop=<n>] [take=<n>] [prefixFilter=<s>]")
    }
  }

  def getBzipWriter(outputFile: File, append: Boolean = false) = {
    val fileOutputStream = new FileOutputStream(outputFile, append)
    val compressOutputStream = new BZip2CompressorOutputStream(fileOutputStream)
    val sw = new OutputStreamWriter(compressOutputStream)
    new BufferedWriter(sw)
  }

  case class AuditEntry(status: String, key: String, message: Option[String] = None, details: Option[JsObject] = None)

  object AuditEntry {
    def apply(status: String, key: String, message: String): AuditEntry = AuditEntry(status, key, Some(message))
    def apply(status: String, key: String, message: String, details: JsObject): AuditEntry = AuditEntry(status, key, Some(message), Some(details))

    implicit val writes: OWrites[AuditEntry] = Json.writes[AuditEntry]
    def audit(writer: BufferedWriter, entry: AuditEntry): Unit = {
      val value = Json.toJsObject(entry)
      val json = writeToString[JsValue](value)
      writer.append(s"$json\n")
    }
    val OK = "OK"
    val SKIPPED = "SKIPPED"
    val ERROR = "ERROR"
  }

  def getAuditFileName(auditFile: File, id: Int = 0): File = {
    val file = new File(s"${auditFile.getPath}${if (id > 0) s".$id" else ""}")
    if (file.exists()) getAuditFileName(auditFile, id+1) else file
  }

  def enactS3Changes(
                        bucketName: String,
                        inputFile: File,
                        auditFile: File,
                        maybeDrop: Option[Int],
                        maybeTake: Option[Int],
                        prefixFilter: Option[String]) = {
    import AuditEntry._

    // do this to ensure creds work before starting
    s3.listObjectsV2(ListObjectsV2Request.builder.bucket(bucketName).build)

    // reporting
    val batchSize = 1000
    val startTime = DateTime.now
    var startBatchTime = DateTime.now
    var total = 0L

    // auditing
    val auditWriter = getBzipWriter(getAuditFileName(auditFile))
    auditWriter.append(s"Enacting changes in $bucketName from $inputFile (dropping: $maybeDrop, taking: $maybeTake, prefixFilter: $prefixFilter)\n")
    System.err.println(s"Enacting changes in $bucketName from $inputFile (dropping: $maybeDrop, taking: $maybeTake, prefixFilter: $prefixFilter)")
    try {
      withSourceFromBzipFile(inputFile) {source =>
        val lines = source
          .getLines()
          .map(line => {
            val maybeJsValue = Try(readFromString[JsValue](line)).toOption
            (
              maybeJsValue.map(_ \ "proposed").flatMap(_.asOpt[ObjectMetadata]),
              maybeJsValue.map(_ \ "original").flatMap(_.asOpt[ObjectMetadata])
            )
          })
        val filteredLines = prefixFilter
          .map(pf => lines.filter{
            case (Some(proposed), _) => proposed.key.startsWith(pf)
            case _ => false
          })
          .getOrElse(lines)
        val droppedLines = maybeDrop.map(filteredLines.drop).getOrElse(filteredLines)
        val linesToProcess = maybeTake.map(droppedLines.take).getOrElse(droppedLines)

        val auditEntries: Iterator[AuditEntry] = linesToProcess
          .map {
            case (Some(proposed), Some(original)) =>
              val key = proposed.key
              Try {Some(s3.headObject(HeadObjectRequest.builder.bucket(bucketName).key(key).build))}.recover{
                case _:NoSuchKeyException => None
              } match {
                case Success(Some(headObjectResponse)) =>
                  val check = headObjectResponse.metadata.asScala
                  if (check!=original.metadata) {
                    if (check==proposed.metadata) {
                      AuditEntry(SKIPPED, key, s"Already updated")
                    } else {
                      AuditEntry(ERROR, key, s"Metadata doesn't match that expected", Json.obj(
                        "actual" -> check,
                        "expected" -> original.metadata
                      ))
                    }
                  } else {
                    val request = CopyObjectRequest.builder
                      .copySource(s"$bucketName/$key")
                      .destinationBucket(bucketName).destinationKey(key)
                      .metadata(proposed.metadata.asJava)
                      .metadataDirective(MetadataDirective.REPLACE)
                      .build
                    Try {s3.copyObject(request)} match {
                      case Success(_) => AuditEntry(OK, key)
                      case Failure(e) => AuditEntry(ERROR, key, s"Error whilst copying object ($e)")
                    }
                  }
                case Success(None) =>
                  AuditEntry(SKIPPED, key, "Object no longer exists")
                case Failure(e) =>
                  AuditEntry(ERROR, key, s"Error whilst getting object metadata ($e)")
              }
            case other => AuditEntry(ERROR, "n/a", s"Unable to parse record", Json.obj("record" -> other.toString))
          }
        auditEntries
          .map{ entry =>
            audit(auditWriter, entry)
            entry
          }
          .grouped(batchSize)
          .foreach{ auditEntryBatch =>
            val auditEntries = auditEntryBatch.toList
            total = total + auditEntries.size
            val now = DateTime.now
            val elapsed = new Duration(startTime, now)
            val elapsedBatch = new Duration(startBatchTime, now).getMillis
            System.err.println(s"${DateTime.now.toString} Processed $total lines")
            System.err.println(s"Batch: Processed ${auditEntries.size} in ${elapsedBatch}ms (mean: ${elapsedBatch/auditEntries.size}ms per line)")
            System.err.println(s"       OK: ${auditEntries.count(_.status==OK)} SKIPPED: ${auditEntries.count(_.status==SKIPPED)} ERROR: ${auditEntries.count(_.status==ERROR)}")
            System.err.println(s"Total: Processed $total in ${elapsed.getStandardSeconds}s (mean: ${elapsed.getMillis/total}ms per line)")
            startBatchTime = now
          }
      }
    } finally {
      auditWriter.close()
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
