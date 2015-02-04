package com.gu.mediaservice.picdarexport.lib.db

import java.net.URI

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.regions.Region
import com.amazonaws.services.dynamodbv2.document.spec.UpdateItemSpec
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap
import com.amazonaws.services.dynamodbv2.model.ReturnValue
import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.picdarexport.model.{DateRange, AssetRef}

import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import play.api.libs.json.JsObject
import play.api.libs.concurrent.Execution.Implicits._

import scala.collection.JavaConversions._
import scala.concurrent.Future

case class AssetRow(
  picdarUrn: String,
  picdarCreated: DateTime,
  picdarAssetUrl: URI
)

class ExportDynamoDB(credentials: AWSCredentials, region: Region, tableName: String)
  extends DynamoDB(credentials, region, tableName) {

  override val IdKey = "picdarUrn"
  val RangeKey = "picdarCreated"

  def insert(id: String, range: DateTime): Future[JsObject] = Future {
    val baseUpdateSpec = new UpdateItemSpec().
      withPrimaryKey(IdKey, id, RangeKey, asRangeString(range)).
      withReturnValues(ReturnValue.ALL_NEW)

    table.updateItem(baseUpdateSpec)
  } map asJsObject

  val rangeDateFormat = ISODateTimeFormat.date
  def asRangeString(dateTime: DateTime) = rangeDateFormat print dateTime

  val timestampDateFormat = ISODateTimeFormat.dateTimeNoMillis
  def asTimestampString(dateTime: DateTime) = timestampDateFormat print dateTime

  def scanUnfetched(dateRange: DateRange): Future[Seq[AssetRef]] = Future {
    // FIXME: query by range only?
    val queryConds = List("attribute_not_exists(picdarAssetUrl)") ++
      dateRange.start.map(date => s"picdarCreated >= :startDate") ++
      dateRange.end.map(date => s"picdarCreated <= :endDate")

    val values = Map() ++
      dateRange.start.map(asRangeString).map(":startDate" -> _) ++
      dateRange.end.map(asRangeString).map(":endDate" -> _)

    val query = queryConds.mkString(" AND ")
    val items = table.scan(query, "picdarUrn, picdarCreated", null, values)
    items.iterator.map { item =>
      AssetRef(item.getString("picdarUrn"), rangeDateFormat.parseDateTime(item.getString("picdarCreated")))
    }.toSeq
  }

  def scanFetchedNotIngested(dateRange: DateRange): Future[Seq[AssetRow]] = Future {
    // FIXME: query by range only?
    val queryConds = List("attribute_exists(picdarAssetUrl)", "attribute_not_exists(mediaUri)") ++
      dateRange.start.map(date => s"picdarCreated >= :startDate") ++
      dateRange.end.map(date => s"picdarCreated <= :endDate")

    val values = Map() ++
      dateRange.start.map(asRangeString).map(":startDate" -> _) ++
      dateRange.end.map(asRangeString).map(":endDate" -> _)

    val query = queryConds.mkString(" AND ")
    val items = table.scan(query, "picdarUrn, picdarCreated, picdarAssetUrl", null, values)
    items.iterator.map { item =>
      val picdarCreated = rangeDateFormat.parseDateTime(item.getString("picdarCreated"))
      AssetRow(item.getString("picdarUrn"), picdarCreated, URI.create(item.getString("picdarAssetUrl")))
    }.toSeq
  }

  def scanIngested(dateRange: DateRange): Future[Seq[AssetRow]] = Future {
    // FIXME: query by range only?
    val queryConds = List("attribute_exists(picdarAssetUrl)", "attribute_exists(mediaUri)") ++
      dateRange.start.map(date => s"picdarCreated >= :startDate") ++
      dateRange.end.map(date => s"picdarCreated <= :endDate")

    val values = Map() ++
      dateRange.start.map(asRangeString).map(":startDate" -> _) ++
      dateRange.end.map(asRangeString).map(":endDate" -> _)

    val query = queryConds.mkString(" AND ")
    val items = table.scan(query, "picdarUrn, picdarCreated, picdarAssetUrl", null, values)
    items.iterator.map { item =>
      val picdarCreated = rangeDateFormat.parseDateTime(item.getString("picdarCreated"))
      AssetRow(item.getString("picdarUrn"), picdarCreated, URI.create(item.getString("picdarAssetUrl")))
    }.toSeq
  }

  def record(urn: String, range: DateTime, assetUrl: URI, picdarCreated: DateTime, picdarModified: Option[DateTime], metadata: Map[String, String]) = Future {
    val baseUpdateSpec = new UpdateItemSpec().
      withPrimaryKey(IdKey, urn, RangeKey, asRangeString(range)).
      withUpdateExpression("SET picdarAssetUrl = :picdarAssetUrl").
      withValueMap(new ValueMap().withString(":picdarAssetUrl", assetUrl.toString)).
      withReturnValues(ReturnValue.ALL_NEW)

    table.updateItem(baseUpdateSpec)

    // TODO: store all
    // TODO: bump assetUrlModifiedAt
    // TODO: bump metadataModifiedAt
  }

  def recordIngested(urn: String, range: DateTime, mediaUri: URI) = Future {
    val baseUpdateSpec = new UpdateItemSpec().
      withPrimaryKey(IdKey, urn, RangeKey, asRangeString(range)).
      withUpdateExpression("SET mediaUri = :mediaUri, mediaUriModified = :mediaUriModified").
      withValueMap(new ValueMap().
        withString(":mediaUri", mediaUri.toString).
        withString(":mediaUriModified", asTimestampString(new DateTime))).
      withReturnValues(ReturnValue.ALL_NEW)

    table.updateItem(baseUpdateSpec)
  }

}
