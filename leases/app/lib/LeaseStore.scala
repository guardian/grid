package lib

import java.util.UUID

import scala.collection.JavaConversions._

import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClient
import com.amazonaws.services.dynamodbv2.document.{KeyAttribute, DynamoDB}
import com.amazonaws.services.dynamodbv2.model.{PutItemResult, AttributeValue}

import com.gu.scanamo._
import com.gu.mediaservice.model.{MediaLease, MediaLeaseType}

import org.joda.time._
import cats.data.Validated
import scala.concurrent.Future
import scala.concurrent.ExecutionContext.Implicits.global
import scalaz.syntax.id._

object LeaseStore {
  import com.gu.scanamo.syntax._

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

  def put(lease: MediaLease) = Future { Scanamo.put[MediaLease](client)(tableName)(lease.copy(id=uuid))  }
  def delete(id: String) = Future { Scanamo.delete(client)(tableName)(key(id)) }

  def get(id: String) =
    Scanamo.get[MediaLease](client)(tableName)(key(id))
      .map(_.toOption)
      .flatten

  def getForMedia(id: String): List[MediaLease] =
    Scanamo.queryIndex[MediaLease](client)(tableName, indexName)('mediaId -> id)
      .toList
      .map(_.toOption)
      .flatten

}
