package lib

import com.amazonaws.services.dynamodbv2.document.{Item, KeyAttribute}
import com.amazonaws.services.dynamodbv2.document.spec.GetItemSpec
import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.model.Edits
import play.api.libs.json.JsObject
import play.api.libs.json.Json

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}

class ImageRelatedData(config: MediaApiConfig)(implicit val ec: ExecutionContext) {

  val leasesTableName = "media-service-DEV-LeasesDynamoTable-AUGMX7FV2O30" // have mediaId index
  val collectionsTableName = "media-service-DEV-ImageCollectionsDynamoTable-1G4SOEEAILGZD" // TODO not have media_id index
  val usagesTableName = "media-service-DEV-UsageRecordTable-1CHL1PN24LIY0" //  have media_id index
  val editsTableName = "media-service-DEV-EditsDynamoTable-6P7WAS0J7ET9" //  TODO not have media_id index

  def getAllRelatedDataFor(mediaId: String) = {

    val f: Future[Map[String, Iterable[JsObject]]] = for {
      leases <- getLeases(mediaId)
      coll <- getCollections(mediaId)
      usages <- getUsages(mediaId)
      meta <- getAllMetadata(mediaId)
    } yield {
      Map(
        "leases" -> leases,
        "collections" -> coll,
        "usages" -> usages,
        "meta" -> meta
      )
    }

    f
  }

  def getCollections(mediaId: String) = Future {
    // id is imageId
    val dynamo = new DynamoDB(config, collectionsTableName)
    val res: Option[Item] = Option(dynamo.table.getItem(
      new GetItemSpec()
        .withPrimaryKey("id", mediaId)
        .withAttributesToGet("collections")
    ))
    res match {
      case Some(r) => Iterable(dynamo.asJsObject(r))
      case _ => Iterable(JsObject.empty)
    }
  }

  ////////////// usages

  def getUsages(mediaId: String) = {
    val usagesDynamo = new DynamoDB(config, usagesTableName)
    val usagesImageIndexName = "media_id"
    val itemsf = queryByImageId(mediaId, usagesImageIndexName, usagesDynamo)
    itemsf.map(items => items.map(usagesDynamo.asJsObject(_)))
  }

  def getLeases(mediaId: String) = {
    val leasesDynamo = new DynamoDB(config, leasesTableName)
    val leasesImageIndexName = "mediaId"
    val itemsf = queryByImageId(mediaId, leasesImageIndexName, leasesDynamo)
    itemsf.map(items => items.map(leasesDynamo.asJsObject(_)))
  }

  def getAllMetadata(mediaId: String) = {
    val editsDynamo = new DynamoDB(config, editsTableName)
    val dynamoEntry: Future[JsObject] = editsDynamo.get(mediaId)
    dynamoEntry.map(Iterable(_))
//    dynamoEntry.map(_.as[Edits])
  }

  private def queryByImageId(id: String, imageIndexName: String, dynamo: DynamoDB) = Future {
    val imageIndex = dynamo.table.getIndex(imageIndexName)
    val keyAttribute = new KeyAttribute(imageIndexName, id)
    val queryResult = imageIndex.query(keyAttribute)

    val fullSet = queryResult.asScala

    fullSet
  }

}
