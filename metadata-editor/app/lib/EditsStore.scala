package lib

import com.gu.mediaservice.model.{Edits, ImageMetadata, Photoshoot, UsageRights}
import com.gu.mediaservice.lib.aws.{DynamoDB, DynamoHelpers}
import org.scanamo.{DynamoFormat, DynamoReadError, ScanamoAsync, Table}
import org.scanamo.generic.semiauto._
import org.scanamo.generic.auto.genericDerivedFormat
import org.scanamo.generic.semiauto.deriveDynamoFormat
import software.amazon.awssdk.services.dynamodb.DynamoDbAsyncClient
import cats.implicits._
import org.joda.time.DateTime
import org.scanamo.syntax._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future
import play.api.libs.json.JsValue
import ImageMetadata._
import UsageRights._

class EditsStore(config: EditsConfig) extends DynamoDB[Edits](config, config.editsTable, Some(Edits.LastModified)) with DynamoHelpers {
  val tableName = config.editsTable
  lazy val dynamoClient: DynamoDbAsyncClient = config.withAWSCredentialsV2(DynamoDbAsyncClient.builder()).build()
  implicit val dateTimeFormat: Typeclass[DateTime] =
    DynamoFormat.coercedXmap[DateTime, String, IllegalArgumentException](DateTime.parse, _.toString)
  implicit val editsFormat: DynamoFormat[Edits] = deriveDynamoFormat[Edits]

  private lazy val editsTable = Table[Edits](tableName)

  def getV2(id: String): Future[Option[Edits]] =
    ScanamoAsync(dynamoClient).exec(editsTable.get("id" === id)).flatMap(maybeEither =>
      maybeEither.fold[Future[Option[Edits]]](
        Future.successful(None)
      )(res =>
        handleResponse(res)(r => Some(r))
      )
    )

  def updateKeyV2[T: DynamoFormat](id: String, key: String, value: T): Future[Edits] = {
    ScanamoAsync(dynamoClient).exec(editsTable.update("id" === id, set(key, value))).flatMap(res =>
      handleResponse(res)(identity)
    )
  }

  def removeKeyV2(id: String, key: String): Future[Edits] = {
    ScanamoAsync(dynamoClient).exec(editsTable.update("id" === id, remove(key))).flatMap(res =>
      handleResponse(res)(identity)
    )
  }

  def setOrRemoveArchivedV2(id: String, archived: Boolean): Future[Edits] = {
    if (archived) updateKeyV2(id, Edits.Archived, archived)
    else removeKeyV2(id, Edits.Archived)
  }
}


