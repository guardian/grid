package lib

import java.util.UUID

import scala.collection.JavaConversions._

import com.amazonaws.services.dynamodbv2.AmazonDynamoDBAsyncClient
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
  import com.gu.scanamo.Table
  import com.gu.scanamo.query._
  import com.gu.scanamo.syntax._

  val tableName = Config.leasesTable
  val indexName = "mediaId"

  implicit val dateTimeFormat =
    DynamoFormat.coercedXmap[DateTime, String, IllegalArgumentException](DateTime.parse(_))(_.toString)
  implicit val enumFormat =
    DynamoFormat.coercedXmap[MediaLeaseType, String, IllegalArgumentException](MediaLeaseType(_))(_.toString)

  lazy val client =
    new AmazonDynamoDBAsyncClient(Config.awsCredentials) <| (_ setRegion Config.dynamoRegion)

  lazy val dynamo = new DynamoDB(client)
  lazy val table  = dynamo.getTable(tableName)
  lazy val index  = table.getIndex(indexName)

  private def mediaKey(id: String) = new KeyAttribute(indexName, id)
  private def uuid = Some(UUID.randomUUID().toString)
  private def key(id: String) = UniqueKey(KeyEquals('id, id))

  def put(lease: MediaLease) = ScanamoAsync.put[MediaLease](client)(tableName)(lease.copy(id=uuid))
  def delete(id: String) = ScanamoAsync.delete(client)(tableName)(key(id))

  def forEach(run: List[MediaLease] => Unit) = ScanamoAsync.exec(client)(
    Table[MediaLease](tableName).scan
      .map(ops => ops.flatMap(_.toOption))
      .map(run)
  )

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
