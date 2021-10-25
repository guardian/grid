package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.model.ImageStatusRecord
import com.gu.scanamo.error.DynamoReadError
import com.gu.scanamo._
import com.gu.scanamo.syntax._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class SoftDeletedMetadataTable(config: MediaApiConfig) extends DynamoDB(config, config.softDeletedMetadataTable) {
  private val softDeletedMetadataTable = Table[ImageStatusRecord](config.softDeletedMetadataTable)

  def getStatus(imageId: String) = {
    ScanamoAsync.exec(client)(softDeletedMetadataTable.get('id -> imageId))
  }

  def setStatus(imageStatus: ImageStatusRecord) = {
    ScanamoAsync.exec(client)(softDeletedMetadataTable.put(imageStatus))
  }

  def updateStatus(imageId: String, isDeleted: Boolean) = {
    val updateExpression = set('isDeleted -> isDeleted)
    ScanamoAsync.exec(client)(
      softDeletedMetadataTable
        .given(attributeExists('id))
        .update(
          'id -> imageId,
          update = updateExpression
        )
    )
  }
}
