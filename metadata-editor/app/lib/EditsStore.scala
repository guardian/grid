package lib

import com.gu.mediaservice.model.{Edits, ImageMetadata, UsageRights}
import com.gu.mediaservice.lib.aws.DynamoDB
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

class EditsStore(config: EditsConfig) extends DynamoDB[Edits](config, config.editsTable, Some(Edits.LastModified)) {
  private val tableName = config.editsTable
  lazy val dynamoClient: DynamoDbAsyncClient = config.withAWSCredentialsV2(DynamoDbAsyncClient.builder()).build()
  implicit val dateTimeFormat: Typeclass[DateTime] =
    DynamoFormat.coercedXmap[DateTime, String, IllegalArgumentException](DateTime.parse, _.toString)
  implicit val edits: DynamoFormat[Edits] = deriveDynamoFormat[Edits]
  private lazy val editsTable = Table[Edits](tableName)

  def handleResponse[T, U](result: Either[DynamoReadError, T])(f: T => U): Future[U] = {
    result.fold(
      error => Future.failed(StoreDynamoError(error, tableName)),
      success => Future.successful(f(success))
    )
  }

  def get(id: String): Future[Option[Edits]] =
    ScanamoAsync(dynamoClient).exec(editsTable.get("id" === id)).flatMap(maybeEither =>
      maybeEither.fold[Future[Option[Edits]]](
        Future.successful(None)
      )(res =>
        handleResponse(res)(r => Some(r))
      )
    )

  def updateKey[T: DynamoFormat](id: String, key: String, value: T): Future[Edits] = {
    ScanamoAsync(dynamoClient).exec(editsTable.update("id" === id, set(key, value))).flatMap(res =>
      handleResponse(res)(identity)
    )
  }

  def deleteKey[T: DynamoFormat](id: String, key: String, value: T): Future[Edits] = {
    ScanamoAsync(dynamoClient).exec(editsTable.update("id" === id, delete(key, value))).flatMap(res =>
      handleResponse(res)(identity)
    )
  }

  def removeKey(id: String, key: String): Future[Edits] = {
    ScanamoAsync(dynamoClient).exec(editsTable.update("id" === id, remove(key))).flatMap(res =>
      handleResponse(res)(identity)
    )
  }

  def setOrRemoveArchived(id: String, archived: Boolean): Future[Edits] = {
    if (archived) updateKey(id, Edits.Archived, archived)
    else removeKey(id, Edits.Archived)
  }
}

case class StoreDynamoError(err: DynamoReadError, tableName: String) extends Throwable {
  val message: String = s"Error accessing ${tableName} store: ${err.toString}"
}
