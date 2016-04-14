package lib

import java.util.UUID

import scala.collection.JavaConversions._

import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClient
import com.amazonaws.services.dynamodbv2.document.{KeyAttribute, DynamoDB}
import com.amazonaws.services.dynamodbv2.model.AttributeValue

import com.gu.scanamo._
import com.gu.mediaservice.model.{MediaLease, MediaLeaseType}

import org.joda.time._
import cats.data.Validated
import scalaz.syntax.id._

object LeaseStore {
  val tableName = Config.leasesTable
  val indexName = "mediaId"

  implicit val dateTimeFormat =
    DynamoFormat.xmap[DateTime, String](d => Validated.valid(new DateTime(d)))(_.toString)
  implicit val enumFormat =
    DynamoFormat.xmap[MediaLeaseType, String](e => Validated.valid(MediaLeaseType(e)))(_.toString)

  lazy val client =
    new AmazonDynamoDBClient(Config.awsCredentials) <| (_ setRegion Config.dynamoRegion)

  lazy val dynamo = new DynamoDB(client)
  lazy val table  = dynamo.getTable(tableName)
  lazy val index  = table.getIndex(indexName)

  private def mediaKey(id: String) = new KeyAttribute(indexName, id)
  private def uuid = Some(UUID.randomUUID().toString)
  private def key(id: String) = UniqueKey(KeyEquals('id, id))

  def put(lease: MediaLease) = Scanamo.put(client)(tableName)(lease.copy(id=uuid))
  def get(id: String) = Scanamo.get[MediaLease](client)(tableName)(key(id))
  def delete(id: String) = Scanamo.delete(client)(tableName)(key(id))

  def getForMedia(id: String): List[MediaLease] = {
    val format = DynamoFormat[MediaLease]

    //TODO: Scanamo will likely support this soon, it won't break if there is more than a page of results
    // so we should use it!
    val results = index
      .query(mediaKey(id))
      .firstPage
      .getLowLevelResult
      .getQueryResult
      .getItems
      .toList

    val leases = results
      .map(lease => format.read(new AttributeValue().withM(lease)))
      .map(_.toOption)
      .flatten

    leases
  }

}
