package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.model.ImageStatusRecord
import com.gu.scanamo._
import com.gu.scanamo.syntax._

import scala.concurrent.ExecutionContext

class SoftDeletedMetadataTable(config: MediaApiConfig) extends DynamoDB[ImageStatusRecord](config, config.softDeletedMetadataTable) {
  private val softDeletedMetadataTable = Table[ImageStatusRecord](table.getTableName)

  def getStatus(imageId: String)(implicit ex: ExecutionContext) = {
    ScanamoAsync.exec(client)(softDeletedMetadataTable.get('id -> imageId))
  }

  def setStatus(imageStatus: ImageStatusRecord)(implicit ex: ExecutionContext) = {
    ScanamoAsync.exec(client)(softDeletedMetadataTable.put(imageStatus))
  }

  def updateStatus(imageId: String, isDeleted: Boolean)(implicit ex: ExecutionContext) = {
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
