package com.gu.mediaservice.scripts

import com.sksamuel.elastic4s.ElasticApi.matchQuery
import com.sksamuel.elastic4s.ElasticDsl._
import org.joda.time.DateTime
import play.api.libs.json.Json
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.dynamodb.model.{AttributeValue, ScanRequest, UpdateItemRequest}
import software.amazon.awssdk.services.dynamodb.{DynamoDbClient, DynamoDbClientBuilder}
import software.amazon.awssdk.services.s3.S3Client

import java.io.{File, FileOutputStream, PrintWriter}
import scala.collection.JavaConverters._
import scala.io.Source
import scala.util.Try

object BackfillEditLastModified extends EsScript {

  private val profile = "media-service"
  private val region = Region.EU_WEST_1
  private val credentials = DefaultCredentialsProvider.builder.profileName(profile).build
  private val dynamo: DynamoDbClient = DynamoDbClient.builder
    .region(region)
    .credentialsProvider(credentials)
    .build

  private var total = 0
  private var skipped = 0
  private var updated = 0

  override def run(esUrl: String, args: List[String]): Unit = {
    def option(options: List[String], argName: String): (Option[String], List[String]) = {
      val arg = options.find(_.startsWith(s"--$argName="))
      val value = arg.map(_.stripPrefix(s"--$argName="))
      value -> options.filterNot(arg.contains)
    }

    args match {
      case dynamoTable :: fileNamePrefix :: remainder  =>
        val (maybeRun, _) = option(remainder, "run")
        val dryRun = !maybeRun.contains("true")
        val esClient = new EsClient(esUrl)
        try {
          backfill(esClient, dynamoTable, fileNamePrefix, dryRun)
        } finally {
          esClient.client.close()
        }
      case _ => throw new IllegalArgumentException("Usage: BackfillEditLastModified <esUrl> <dynamoEditsTable> <filePrefix> [--run=true]")
    }
  }

  def backfill(esClient: EsClient, dynamoTable: String, fileName: String, dryRun: Boolean): Unit = {
    val lastFile = new File(s"$fileName.last")
    val lastEvaluatedKey = if (lastFile.exists()) {
      val source = Source.fromFile(lastFile)
      val lastId = try {
        source.getLines.toList match {
          case id :: totalStr :: _ =>
            total = totalStr.toInt
            Some(id)
          case _ => None
        }
      } finally {
        source.close()
      }
      lastId.map { id =>
        Map("id" -> AttributeValue.builder.s(id).build).asJava
      }
    } else None

    val logWriter = new PrintWriter(new FileOutputStream(s"$fileName.$total.log"))
    def log(msg: String) = logWriter.println(s"[${DateTime.now}/($total/U:$updated/S:$skipped]: $msg")

    log(s"Starting backfill of $dynamoTable from ${esClient.url}; ${if(dryRun){"DRYRUN ONLY"}else{"RUNNING"}}")
    log(s"Last evaluated key: $lastEvaluatedKey")
    // scan through edits table (this is the shorter list by far)
    val scanIterator = dynamo.scanPaginator(
      ScanRequest.builder
        .tableName(dynamoTable)
        .projectionExpression("id")
        .limit(500)
        .exclusiveStartKey(lastEvaluatedKey.orNull)
        .build
    )
    scanIterator
      .iterator().asScala
      .map { r =>

        val lastEvaluatedKey = Some(r.lastEvaluatedKey.asScala)
          .filter(_ => r.hasLastEvaluatedKey)
          .flatMap(_.get("id"))
          .map(_.s())


        lastEvaluatedKey -> r.items.asScala
      }
      .map { case (lek, records) =>
        lek -> records.flatMap(_.asScala.get("id").map(_.s))
      }
      .foreach { case (lek, imageIds) =>
        imageIds.foreach { id =>
          // for each edit entry:
          // do a simple get on the ES cluster
          val maybeLastModified = getUserMetadataLastModified(esClient, id)
          // update just the last modified value on the edits table
          maybeLastModified match {
            case Left(reason) =>
              skipped += 1
              log(s"$id: Unable to get userMetadataLastModified - $reason")
            case Right(lastModified) =>
              updated += 1
              val result = updateEditRecord(dynamoTable, id, lastModified, dryRun)
              log(s"$id: $result")
          }
          total += 1
          Thread.sleep(10)
        }

        lek match {
          case Some(id) =>
            log(s"Last evaluated key $id (batch of ${imageIds.size})")
            val logWriter = new PrintWriter(new FileOutputStream(lastFile))
            try {
              logWriter.println(id)
              logWriter.println(total)
            } finally {
              logWriter.close()
            }
          case None => // nowt
        }

      }
    log(s"Finished. Updated: $updated; Skipped: $skipped")
  }

  def getUserMetadataLastModified(esClient: EsClient, id: String): Either[String, DateTime] = {
    val client = esClient.client
    val index = esClient.currentIndex
    val queryType = matchQuery("id", id)
    val queryResponse = client.execute({
      search(index)
        .query(queryType)
        .fetchSource(false)
        .sourceInclude(
          "id",
          "userMetadataLastModified"
        )
    }).await

    queryResponse.status match {
      case 200 => queryResponse.result.hits.hits.flatMap{ hit =>
        (Json.parse(hit.sourceAsString) \ "userMetadataLastModified").asOpt[String]
      }
        .headOption
        .toRight("Not in ES document")
        .flatMap { lm =>
          Try(new DateTime(lm)).toEither.left.map { t =>
            t.toString
          }
        }
      case _ =>
        client.close()
        throw new Exception("Failed performing search query")
    }
  }

  def updateEditRecord(tableName: String, id: String, lastModified: DateTime, dryRun: Boolean): String = {
    val request = UpdateItemRequest.builder
      .tableName(tableName)
      .key(Map("id" -> AttributeValue.builder.s(id).build).asJava)
      .updateExpression("SET lastModified = :lastModified")
      .expressionAttributeValues(Map(":lastModified" -> AttributeValue.builder.s(lastModified.toString).build).asJava)
      .build
    val msg = s"Updated with $lastModified ($request)"
    if (dryRun) {
      s"Would: $msg"
    } else {
      dynamo.updateItem(request)
      msg
    }
  }

  override def usageError: Nothing = {
    System.err.println("Usage: BackfillEditLastModified <ES_URL> <EDITS_DYNAMO_TABLE_NAME> [--run=true]")
    sys.exit(1)
  }
}
