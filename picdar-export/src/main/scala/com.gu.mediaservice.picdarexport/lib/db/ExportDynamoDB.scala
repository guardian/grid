package com.gu.mediaservice.picdarexport.lib.db

import java.net.URI

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.regions.Region
import com.amazonaws.services.dynamodbv2.document.{KeyAttribute, ScanOutcome, ItemCollection, Item}
import com.amazonaws.services.dynamodbv2.document.spec.{GetItemSpec, ScanSpec, UpdateItemSpec}
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap
import com.amazonaws.services.dynamodbv2.model.ReturnValue
import com.amazonaws.services.dynamodbv2.xspec.ExpressionSpecBuilder
import com.amazonaws.services.dynamodbv2.xspec.ExpressionSpecBuilder.{S, N, M, BOOL}
import com.amazonaws.services.dynamodbv2.document.Item
import com.amazonaws.services.dynamodbv2.document.TableKeysAndAttributes
import com.amazonaws.services.dynamodbv2.document.BatchGetItemOutcome
import com.amazonaws.services.dynamodbv2.model.KeysAndAttributes

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.model.{UsageRights, ImageMetadata}
import com.gu.mediaservice.picdarexport.model.{PicdarUsageRecord, DateRange, AssetRef, PicdarDates}
import com.gu.mediaservice.picdarexport.lib.Config

import lib.MD5

import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import play.api.libs.json.{Writes, Json, JsObject}
import play.api.libs.concurrent.Execution.Implicits._
import play.api.Logger

import scala.collection.JavaConverters._
import scala.collection.JavaConversions._
import scala.concurrent.Future

import scalaz.syntax.id._


trait DynamoDates {
  val rangeDateFormat = ISODateTimeFormat.date
  def asRangeString(dateTime: DateTime) = rangeDateFormat print dateTime

  val timestampDateFormat = ISODateTimeFormat.dateTimeNoMillis
  def asTimestampString(dateTime: DateTime) = timestampDateFormat print dateTime
}

case class AssetRow(
  picdarUrn: String,
  picdarCreated: DateTime,
  picdarCreatedFull: Option[DateTime],
  picdarAssetUrl: Option[URI],
  mediaUri: Option[URI] = None,
  picdarMetadata: Option[ImageMetadata] = None,
  picdarRights: Option[UsageRights] = None,
  picdarUsage: Option[List[PicdarUsageRecord]] = None
)
object AssetRow extends DynamoDates {
  def apply(item: Item): AssetRow = {
    val picdarCreated =
      rangeDateFormat.parseDateTime(item.getString("picdarCreated"))
    val picdarCreatedFull =
      Option(item.getString("picdarCreatedFull")).map(timestampDateFormat.parseDateTime)

    val mediaUri = Option(item.getString("mediaUri"))
      .map(URI.create)
    val picdarMetadata = Option(item.getJSON("picdarMetadata"))
      .map(json => Json.parse(json).as[ImageMetadata])
    val picdarRights = Option(item.getJSON("picdarRights"))
      .map(json => Json.parse(json).as[UsageRights])
    val picdarAssetUrl = Option(item.getString("picdarAssetUrl"))
      .map(URI.create)
    val picdarUsage = Option(item.getString("picdarUsage"))
      .map(json => Json.parse(json).as[List[PicdarUsageRecord]])

    AssetRow(
      picdarUrn = item.getString("picdarUrn"),
      picdarCreated = picdarCreated,
      picdarCreatedFull = picdarCreatedFull,
      picdarAssetUrl = picdarAssetUrl,
      mediaUri = mediaUri,
      picdarMetadata = picdarMetadata,
      picdarRights = picdarRights,
      picdarUsage = picdarUsage
    )
  }
}

class ExportDynamoDB(credentials: AWSCredentials, region: Region, tableName: String)
  extends DynamoDB(credentials, region, tableName) with DynamoDates {

  val picdarCreatedIndex = "picdarCreated-index"

  override val IdKey = "picdarUrn"
  val RangeKey = "picdarCreated"

  def insert(id: String, range: DateTime): Future[JsObject] = Future {
    val baseUpdateSpec = new UpdateItemSpec()
      .withPrimaryKey(IdKey, id, RangeKey, asRangeString(range))
      .withReturnValues(ReturnValue.ALL_NEW)

    table.updateItem(baseUpdateSpec)
  } map asJsObject


  val fetchFields = List("picdarAssetUrl", "picdarMetadataModified")
  val notFetchedCondition =
    "(" + fetchFields.map(f => s"attribute_not_exists($f)").mkString(" OR ") + ")"
  val fetchedCondition =
    "(" + fetchFields.map(f => s"attribute_exists($f)").mkString(" AND ") + ")"

  val ingestedCondition = "attribute_exists(mediaUri)"

  val noRightsCondition = "(attribute_not_exists(picdarRights))"
  val hasRightsNotOverridden = List("attribute_exists(picdarRights)", "attribute_not_exists(picdarRightsOverridden)")


  def scanUnfetched(dateRange: DateRange): Future[Seq[AssetRef]] = Future {
    // FIXME: query by range only?
    val queryConds = List(notFetchedCondition) ++
      dateRange.start.map(date => s"picdarCreated >= :startDate") ++
      dateRange.end.map(date => s"picdarCreated <= :endDate")

    val values = Map() ++
      dateRange.start.map(asRangeString).map(":startDate" -> _) ++
      dateRange.end.map(asRangeString).map(":endDate" -> _)

    val projectionAttrs = List("picdarUrn", "picdarCreated")
    val items = scan(queryConds, projectionAttrs, values)
    items.iterator.map { item =>
      AssetRef(item.getString("picdarUrn"), rangeDateFormat.parseDateTime(item.getString("picdarCreated")))
    }.toSeq
  }

  def scanFetchedNotIngested(dateRange: DateRange): Future[Seq[AssetRow]] = Future {
    // FIXME: query by range only?
    val queryConds = List(fetchedCondition, "attribute_not_exists(mediaUri)") ++
      dateRange.start.map(date => s"picdarCreated >= :startDate") ++
      dateRange.end.map(date => s"picdarCreated <= :endDate")

    val values = Map() ++
      dateRange.start.map(asRangeString).map(":startDate" -> _) ++
      dateRange.end.map(asRangeString).map(":endDate" -> _)

    val projectionAttrs = List("picdarUrn", "picdarCreated", "picdarCreatedFull", "picdarAssetUrl")
    val items = scan(queryConds, projectionAttrs, values)
    items.iterator.map(AssetRow(_)).toSeq
  }

  def scanIngestedNotOverridden(dateRange: DateRange): Future[Seq[AssetRow]] = Future {
    // FIXME: query by range only?
    val queryConds = List(fetchedCondition, ingestedCondition, "attribute_not_exists(overridden)") ++
      dateRange.start.map(date => s"picdarCreated >= :startDate") ++
      dateRange.end.map(date => s"picdarCreated <= :endDate")

    val values = Map() ++
      dateRange.start.map(asRangeString).map(":startDate" -> _) ++
      dateRange.end.map(asRangeString).map(":endDate" -> _)

    val projectionAttrs = List("picdarUrn", "picdarCreated", "picdarCreatedFull", "picdarAssetUrl", "mediaUri", "picdarMetadata")
    val items = scan(queryConds, projectionAttrs, values)
    items.iterator.map(AssetRow(_)).toSeq
  }

  def scanOverridden(dateRange: DateRange): Future[Seq[AssetRow]] = Future {
    // FIXME: query by range only?
    val queryConds = List(fetchedCondition, ingestedCondition, "attribute_exists(overridden)") ++
      dateRange.start.map(date => s"picdarCreated >= :startDate") ++
      dateRange.end.map(date => s"picdarCreated <= :endDate")

    val values = Map() ++
      dateRange.start.map(asRangeString).map(":startDate" -> _) ++
      dateRange.end.map(asRangeString).map(":endDate" -> _)

    val projectionAttrs = List("picdarUrn", "picdarCreated", "picdarCreatedFull", "picdarAssetUrl", "mediaUri")
    val items = scan(queryConds, projectionAttrs, values)
    items.iterator.map(AssetRow(_)).toSeq
  }

  type Conditions = List[String]
  implicit class ConditionHelper(conditions: Conditions) {
    def withDateRange(dateRange: DateRange) = conditions ++
      dateRange.start.map(date => s"picdarCreated >= :startDate") ++
      dateRange.end.map(date => s"picdarCreated <= :endDate")
  }

  type ConditionValues = Map[String, String]
  implicit class ConditionValuesHelper(conditionValues: ConditionValues) {
    def withDateRangeValues(dateRange: DateRange) = conditionValues ++
      dateRange.start.map(asRangeString).map(":startDate" -> _) ++
      dateRange.end.map(asRangeString).map(":endDate" -> _)
  }

  def getRow(ref: AssetRef) = Future {
    table.getItem(
      new GetItemSpec().
      withPrimaryKey(
        IdKey, ref.urn,
        RangeKey, PicdarDates.dynamoDbFormat.print(ref.dateLoaded)
      )
    )
  }

  def getRowsForDateRange(dateRange: DateRange) = getUrnsForDateRange(dateRange).flatMap(assetRefs => {
    val maxBatchSize = 100

    Future { assetRefs.grouped(maxBatchSize).flatMap(batch => {
      val batchSpec = batch.foldLeft(new TableKeysAndAttributes(tableName))(
        (keys: TableKeysAndAttributes, assetRef: AssetRef) => {
          keys.addHashAndRangePrimaryKeys(
            IdKey, RangeKey,
            assetRef.urn, PicdarDates.dynamoDbFormat.print(assetRef.dateLoaded)
          )
        })

      val outcome = dynamo.batchGetItem(batchSpec)
      val items = outcome.getTableItems.get(tableName).asScala.toList

      items.map(AssetRow(_))
    }).toList}
  })

  def getUrnsForDateRange(dateRange: DateRange) = Future {
    val imageIndex = table.getIndex(picdarCreatedIndex)

    val items = for {
      date  <- dateRange.dateList

      dateString = PicdarDates.dynamoDbFormat.print(date)
      key = new KeyAttribute(RangeKey, dateString)
      query = imageIndex.query(key).pages.asScala
      pages <- query

      _ = Logger.info(s"Getting URNs for $date")

      items <- pages
    } yield items

    items.map(AssetRef(_))
  }

  private def getUnprocessedItems(outcome: BatchGetItemOutcome): List[Item] = {
    val keys = outcome.getUnprocessedKeys()

    if(keys.size > 0) {
      val unprocOutcome = dynamo.batchGetItemUnprocessed(keys)

      unprocOutcome.getTableItems.get(tableName)
        .asScala.toList ::: getUnprocessedItems(unprocOutcome)

      } else {
        Nil
      }
  }


  def getUrnsForNotFilledFields[T](
    dateRange: DateRange,
    mustNotHave: Set[String],
    mustHave: Set[String] = Set.empty
  )(f: Item => T): Future[Seq[T]] = {
    val maxBatchSize = 100

    getUrnsForDateRange(dateRange).flatMap(assetRefs => {
      Future { assetRefs.grouped(maxBatchSize).flatMap(batch => {
        val batchSpec = batch.foldLeft(new TableKeysAndAttributes(tableName))(
          (keys: TableKeysAndAttributes, assetRef: AssetRef) => {
            keys.addHashAndRangePrimaryKeys(
              IdKey, RangeKey,
              assetRef.urn, PicdarDates.dynamoDbFormat.print(assetRef.dateLoaded)
            )
          })

        val outcome = dynamo.batchGetItem(batchSpec)
          val items = outcome.getTableItems.get(tableName).asScala.toList

          (items ::: getUnprocessedItems(outcome)).filter(row => {
            (!(mustNotHave.subsetOf(row.attributes.map(_.getKey).toSet)) || mustNotHave.isEmpty || Config.overwriteFlag) &&
            mustHave.subsetOf(row.attributes.map(_.getKey).toSet)
          }).map(f(_))
      }).toList}
    })
  }

  def getNoUsage(dateRange: DateRange) = {
    getUrnsForNotFilledFields[AssetRef](dateRange, Set("picdarUsage"))(
      (item: Item) => AssetRef(item))
  }
  def getUsageNotRecorded(dateRange: DateRange) = {
    getUrnsForNotFilledFields(dateRange, Set("picdarUsage", "usageSent"), Set("mediaUri"))(
      (item: Item) => AssetRow(item))
  }
  def getUnfetched(dateRange: DateRange) = {
    getUrnsForNotFilledFields(dateRange, Set("picdarAssetUrl", "picdarMetadataModified"))(
      (item: Item) => AssetRef(item))
  }
  def getNotIngested(dateRange: DateRange) = {
    getUrnsForNotFilledFields(dateRange, Set("mediaUri"), Set("picdarAssetUrl","picdarCreatedFull"))(
      (item: Item) => AssetRow(item))
  }


  def scanNoRights(dateRange: DateRange): Future[Seq[AssetRef]] = Future {
    val queryConds = List(fetchedCondition, noRightsCondition).withDateRange(dateRange)
    val values = Map[String, String]().withDateRangeValues(dateRange)

    val projectionAttrs = List("picdarUrn", "picdarCreated", "picdarCreatedFull", "picdarAssetUrl")
    val items = scan(queryConds, projectionAttrs, values)
    items.iterator.map(AssetRef(_)).toSeq
  }

  def recordUsageSent(urn: String, range: DateTime) = Future {
    val now = asTimestampString(new DateTime)

    val spec = (new ExpressionSpecBuilder() <| (xspec => {
      List(
        BOOL("usageSent").set(true),
        S("usageSentModified").set(now)
      ).foreach(xspec.addUpdate(_))

    })).buildForUpdate

    val baseUpdateSpec = new UpdateItemSpec()
      .withPrimaryKey(IdKey, urn, RangeKey, asRangeString(range))
      .withExpressionSpec(spec)
      .withReturnValues(ReturnValue.ALL_NEW)

    table.updateItem(baseUpdateSpec)
  }

  def scanRightsFetchedNotOverridden(dateRange: DateRange): Future[Seq[AssetRow]] = Future {
    // FIXME: query by range only?
    val queryConds = (List(fetchedCondition, ingestedCondition) ++ hasRightsNotOverridden).withDateRange(dateRange)
    val values = Map[String, String]().withDateRangeValues(dateRange)

    val projectionAttrs = List("picdarUrn", "picdarCreated", "picdarCreatedFull", "picdarAssetUrl", "mediaUri", "picdarRights")
    val items = scan(queryConds, projectionAttrs, values)
    items.iterator.map(AssetRow(_)).toSeq
  }

  // TODO: get ImageMetadata object from Picdar?
  def record(urn: String, range: DateTime, assetUrl: URI, picdarCreated: DateTime, picdarModified: Option[DateTime], metadata: ImageMetadata) = Future {
    val now = asTimestampString(new DateTime)
    val baseUpdateSpec = new UpdateItemSpec().
      withPrimaryKey(IdKey, urn, RangeKey, asRangeString(range)).
      withUpdateExpression("""|SET picdarAssetUrl         = :picdarAssetUrl,
                              |    picdarAssetUrlModified = :picdarAssetUrlModified,
                              |    picdarCreatedFull      = :picdarCreatedFull,
                              |    picdarModified         = :picdarModified,
                              |    picdarMetadata         = :picdarMetadata,
                              |    picdarMetadataModified = :picdarMetadataModified
                              |    """.stripMargin).
      withValueMap(new ValueMap().
        withString(":picdarAssetUrl", assetUrl.toString).
        withString(":picdarAssetUrlModified", now).
        withString(":picdarCreatedFull", asTimestampString(picdarCreated)).
        withString(":picdarModified", picdarModified.map(asTimestampString).orNull).
        withMap(":picdarMetadata", toMap(metadata)).
        withString(":picdarMetadataModified", now)
      ).
      withReturnValues(ReturnValue.ALL_NEW)

    table.updateItem(baseUpdateSpec)
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

  def recordOverridden(urn: String, range: DateTime, overridden: Boolean) = Future {
    val baseUpdateSpec = new UpdateItemSpec().
      withPrimaryKey(IdKey, urn, RangeKey, asRangeString(range)).
      withUpdateExpression("SET overridden = :overridden, overriddenModified = :overriddenModified").
      withValueMap(new ValueMap().
        withBoolean(":overridden", overridden).
        withString(":overriddenModified", asTimestampString(new DateTime))).
      withReturnValues(ReturnValue.ALL_NEW)

    table.updateItem(baseUpdateSpec)
  }

  // Oh yes.
  def rightsToMap[T](caseClassOpt: Option[T])(implicit tjs: Writes[T]) =
    // we record empty rights if there isn't any
    caseClassOpt.map { caseClass =>
      Json.toJson(caseClass).as[Map[String, String]]
    }.getOrElse(Map())

  def recordUsage(urn: String, range: DateTime, usages: List[PicdarUsageRecord]) = Future {
    val data = Json.stringify(Json.toJson(usages))
    val checksum = MD5.hash(data)

    val spec = (new ExpressionSpecBuilder() <| (xspec => {
      List(
        S("picdarUsage").set(data),
        S("picdarUsageChecksum").set(checksum)
      ).foreach(xspec.addUpdate(_))

    })).buildForUpdate

    val baseUpdateSpec = new UpdateItemSpec()
      .withPrimaryKey(IdKey, urn, RangeKey, asRangeString(range))
      .withExpressionSpec(spec)
      .withReturnValues(ReturnValue.ALL_NEW)

    table.updateItem(baseUpdateSpec)
  }

  def recordRights(urn: String, range: DateTime, rights: Option[UsageRights]) = Future {
    val baseUpdateSpec = new UpdateItemSpec().
      withPrimaryKey(IdKey, urn, RangeKey, asRangeString(range)).
      withUpdateExpression("SET picdarRights = :rights, picdarRightsModified = :picdarRightsModified").
      withValueMap(new ValueMap().
        withMap(":rights", rightsToMap(rights)).
        withString(":picdarRightsModified", asTimestampString(new DateTime))).
      withReturnValues(ReturnValue.ALL_NEW)

    table.updateItem(baseUpdateSpec)
  }

  def recordRightsOverridden(urn: String, range: DateTime, overridden: Boolean) = Future {
    val baseUpdateSpec = new UpdateItemSpec().
      withPrimaryKey(IdKey, urn, RangeKey, asRangeString(range)).
      withUpdateExpression("SET picdarRightsOverridden = :overridden, picdarRightsOverriddenModified = :overriddenModified").
      withValueMap(new ValueMap().
      withBoolean(":overridden", overridden).
      withString(":overriddenModified", asTimestampString(new DateTime))).
      withReturnValues(ReturnValue.ALL_NEW)

    table.updateItem(baseUpdateSpec)
  }

  def delete(dateRange: DateRange) = Future {
    val queryConds = List() ++
      dateRange.start.map(date => s"picdarCreated >= :startDate") ++
      dateRange.end.map(date => s"picdarCreated <= :endDate")

    val values = Map() ++
      dateRange.start.map(asRangeString).map(":startDate" -> _) ++
      dateRange.end.map(asRangeString).map(":endDate" -> _)

    val query = queryConds.mkString(" AND ")
    val items = table.scan(query, "picdarUrn, picdarCreated", null, values)
    items.iterator.map { item =>
      val Seq(picdarUrn, picdarCreated) = Seq("picdarUrn", "picdarCreated").map(item.getString)
      table.deleteItem("picdarUrn", picdarUrn, "picdarCreated", picdarCreated)
    }

  }


  private def makeScanSpec(filterConditions: Seq[String], projectionAttrs: Seq[String], valueMap: Map[String, String]): ScanSpec = {
    val baseScanSpec = new ScanSpec().
      withFilterExpression(filterConditions.mkString(" AND ")).
      withProjectionExpression(projectionAttrs.mkString(", "))

    if (valueMap.isEmpty)
      baseScanSpec
    else
      baseScanSpec.withValueMap(valueMap)
  }

  private def scan(filterConditions: Seq[String], projectionAttrs: Seq[String], valueMap: Map[String, String]): ItemCollection[ScanOutcome] = {
    table.scan(makeScanSpec(filterConditions, projectionAttrs, valueMap))
  }

  private def toMap(metadata: ImageMetadata): Map[String, String] = {
    Map() ++
      metadata.description.map("description" -> _) ++
      metadata.credit.map("credit" -> _) ++
      metadata.byline.map("byline" -> _) ++
      metadata.bylineTitle.map("bylineTitle" -> _) ++
      metadata.title.map("title" -> _) ++
      metadata.copyrightNotice.map("copyrightNotice" -> _) ++
      metadata.copyright.map("copyright" -> _) ++
      metadata.suppliersReference.map("suppliersReference" -> _) ++
      metadata.source.map("source" -> _) ++
      metadata.specialInstructions.map("specialInstructions" -> _) ++
      // FIXME: skipping keywords
      metadata.subLocation.map("subLocation" -> _) ++
      metadata.city.map("city" -> _) ++
      metadata.state.map("state" -> _) ++
      metadata.country.map("country" -> _) ++
      metadata.byline.map("byline" -> _)
  }

}
