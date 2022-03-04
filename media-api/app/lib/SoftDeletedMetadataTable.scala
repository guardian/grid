package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.model.ImageStatusRecord
import org.scanamo._
import org.scanamo.auto.genericProduct
import org.scanamo.error.{DynamoReadError, ScanamoError}
import org.scanamo.syntax._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class SoftDeletedMetadataTable(config: MediaApiConfig) extends DynamoDB(config, config.softDeletedMetadataTable) {
  private val softDeletedMetadataTable = Table[ImageStatusRecord](config.softDeletedMetadataTable)

  private val scanamoAsync = ScanamoAsync(client)

  def getStatus(imageId: String): Future[Option[Either[DynamoReadError, ImageStatusRecord]]] = {
    scanamoAsync.exec(softDeletedMetadataTable.get("id" -> imageId))
  }

  def setStatus(imageStatus: ImageStatusRecord): Future[Option[Either[DynamoReadError, ImageStatusRecord]]] = {
    scanamoAsync.exec(softDeletedMetadataTable.put(imageStatus))
  }

  def updateStatus(imageId: String, isDeleted: Boolean): Future[Either[ScanamoError, ImageStatusRecord]] = {
    val updateExpression = set("isDeleted" -> isDeleted)
    scanamoAsync.exec(
      softDeletedMetadataTable
        .given(attributeExists("id"))
        .update(
          "id" -> imageId,
          update = updateExpression
        )
    )
  }
}
