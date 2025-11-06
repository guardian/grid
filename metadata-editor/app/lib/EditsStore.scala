package lib

import com.gu.mediaservice.model.{Edits, ImageMetadata, UsageRights}
import com.gu.mediaservice.lib.aws.DynamoDB
import org.scanamo.{DynamoFormat, DynamoReadError, ScanamoAsync, Table, DynamoValue, InvalidPropertiesError, TypeCoercionError}
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
//  implicit val edits: DynamoFormat[Edits] = deriveDynamoFormat[Edits]
implicit val editsFormat: DynamoFormat[Edits] = {
  val derived = deriveDynamoFormat[Edits]
  new DynamoFormat[Edits] {
    def read(value: DynamoValue): Either[DynamoReadError, Edits] =
      derived.read(value).left.flatMap {
        case InvalidPropertiesError(errs)
          if errs.exists(_._1 == "usageRights") =>
          // Try reading again after dropping the null
          value.asObject match {
            case Some(fields) => derived.read(DynamoValue.fromDynamoObject(fields - "usageRights"))
            case None => Left(TypeCoercionError(new Exception("Invalid Edits structure")))
          }
        case other => Left(other)
      }
    def write(v: Edits): DynamoValue = derived.write(v)
  }
}
  private lazy val editsTable = Table[Edits](tableName)

  def handleResponse[T, U](result: Either[DynamoReadError, T])(f: T => U): Future[U] = {
    result.fold(
      error => Future.failed(StoreDynamoError(error, tableName)),
      success => Future.successful(f(success))
    )
  }

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

  def deleteKeyV2[T: DynamoFormat](id: String, key: String, value: T): Future[Edits] = {
    ScanamoAsync(dynamoClient).exec(editsTable.update("id" === id, delete(key, value))).flatMap(res =>
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

case class StoreDynamoError(err: DynamoReadError, tableName: String) extends Throwable {
  val message: String = s"Error accessing ${tableName} store: ${err.toString}"
}
