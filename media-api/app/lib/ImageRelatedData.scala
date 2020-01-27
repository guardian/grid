package lib

import com.amazonaws.services.dynamodbv2.document.spec.GetItemSpec
import com.amazonaws.services.dynamodbv2.document.{Item, KeyAttribute, Table}
import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.lib.usage.{ItemToMediaUsage, UsageBuilder}
import com.gu.mediaservice.model.leases.{LeasesByMedia, MediaLease}
import com.gu.mediaservice.model.usage.{MediaUsage, Usage}
import com.gu.mediaservice.model.{Collection, Edits}
import play.api.libs.json.{JsObject, Json}

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}

case class ImageAdditionalData(leases: LeasesByMedia = LeasesByMedia.empty,
                               collections: List[Collection] = Nil,
                               usages: List[Usage] = Nil,
                               userMetadata: Option[Edits]
                              )

object ImageAdditionalData {
  implicit val ImageRAdditionalDataFormatter = Json.format[ImageAdditionalData]
}

class ImageRelatedData(config: MediaApiConfig)(implicit val ec: ExecutionContext) {

  val leasesTableName = "media-service-DEV-LeasesDynamoTable-AUGMX7FV2O30" // have mediaId index
  val collectionsTableName = "media-service-DEV-ImageCollectionsDynamoTable-1G4SOEEAILGZD" // TODO not have media_id index
  val usagesTableName = "media-service-DEV-UsageRecordTable-1CHL1PN24LIY0" //  have media_id index
  val editsTableName = "media-service-DEV-EditsDynamoTable-6P7WAS0J7ET9" //  TODO not have media_id index

  val usageDynamo = new DynamoDB(config, usagesTableName)
  val collectionsDynamo = new DynamoDB(config, collectionsTableName)
  val leasesDynamo = new DynamoDB(config, leasesTableName)
  val editsDynamo = new DynamoDB(config, editsTableName)

  def getAllRelatedDataFor(mediaId: String) = {

    val f = for {
      leases <- getLeases(mediaId)
      coll <- getCollections(mediaId)
      usages <- getUsages(mediaId)
      edits <- getAllMetadata(mediaId)
    } yield {

      ImageAdditionalData(leases, coll, usages, Some(edits))
    }

    f
  }

  def getUsages(mediaId: String) = {
    val usagesImageIndexName = "media_id"
    val itemsf = queryByImageId(mediaId, usagesImageIndexName, usageDynamo)
    itemsf.map(items => {
      items.map(i => ItemToMediaUsage.transform(i)).map(UsageBuilder.build).toList
    })
  }

  def getCollections(mediaId: String): Future[List[Collection]] = Future {
    val res: Option[Item] = Option(collectionsDynamo.table.getItem(
      new GetItemSpec()
        .withPrimaryKey("id", mediaId)
        .withAttributesToGet("collections")
    ))

    res match {
      case Some(c) =>
        val json = collectionsDynamo.asJsObject(c)
        (json \ "collections").as[List[Collection]]
      case None => Nil
    }
  }

  import MediaLease._

  def getLeases(mediaId: String): Future[LeasesByMedia] = {
    val leasesImageIndexName = "mediaId"
    val itemsf = queryByImageId(mediaId, leasesImageIndexName, leasesDynamo)
    itemsf.map(items => {
      val leases = items.map(i => {
        val json = leasesDynamo.asJsObject(i)
        json.as[MediaLease]
      }).toList
      LeasesByMedia.build(leases)
    })
  }

  def getAllMetadata(mediaId: String): Future[Edits] = {
    val dynamoEntry: Future[JsObject] = editsDynamo.get(mediaId)
    dynamoEntry.map(_.as[Edits])
  }

  private def queryByImageId(id: String, imageIndexName: String, dynamo: DynamoDB) = Future {
    val imageIndex = dynamo.table.getIndex(imageIndexName)
    val keyAttribute = new KeyAttribute(imageIndexName, id)
    val queryResult = imageIndex.query(keyAttribute)
    val fullSet = queryResult.asScala
    fullSet
  }

  ////////

  def queryByImageId(id: String, table: Table, imageIndexName: String): Future[Set[MediaUsage]] = Future {
    val imageIndex = table.getIndex(imageIndexName)
    val keyAttribute = new KeyAttribute(imageIndexName, id)
    val queryResult = imageIndex.query(keyAttribute)

    val fullSet = queryResult.asScala.map(ItemToMediaUsage.transform).toSet[MediaUsage]

    //    hidePendingIfPublished(
    //      hidePendingIfRemoved(fullSet))
    fullSet
  }

}
