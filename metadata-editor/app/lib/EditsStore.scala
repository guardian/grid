package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.model.{Collection, Edits, ImageMetadata}
import org.scanamo.{DynamoFormat, DynamoReadError, ScanamoAsync, Table}
import org.scanamo.generic.auto.genericDerivedFormat
import org.scanamo.generic.semiauto.deriveDynamoFormat
import play.api.libs.json.JsObject
import software.amazon.awssdk.services.dynamodb.DynamoDbAsyncClient
import cats.implicits._
import org.scanamo.syntax._

import scala.concurrent.{ExecutionContext, Future}

class EditsStore(config: EditsConfig) extends DynamoDB[Edits](config, config.editsTable, Some(Edits.LastModified))  {
  private val tableName = config.editsTable
  lazy val dynamoClient: DynamoDbAsyncClient = config.withAWSCredentialsV2(DynamoDbAsyncClient.builder()).build()
  implicit val edits: DynamoFormat[Edits] = deriveDynamoFormat[Edits]
  implicit val imageMetadata: DynamoFormat[ImageMetadata] = deriveDynamoFormat[ImageMetadata]
  private lazy val editsTable = Table[Edits](tableName)
  def handleResponse[T, U](result: Either[DynamoReadError, T])(f: T => U): Future[U] = {
    result.fold(
      error => Future.failed(StoreDynamoError(error, tableName)),
      success => Future.successful(f(success))
    )
  }

  def get(id: String)
         (implicit ex: ExecutionContext): Future[Option[Edits]] =
    ScanamoAsync(dynamoClient).exec(editsTable.get("id" === id)).flatMap(maybeEither =>
      maybeEither.fold[Future[Option[Edits]]](
        Future.successful(None)
      )(res =>
        handleResponse(res)(r => Some(r))
      )
    )
  }

case class StoreDynamoError(err: DynamoReadError, tableName: String) extends Throwable {
  val message: String = s"Error accessing ${tableName} store: ${err.toString}"
}
