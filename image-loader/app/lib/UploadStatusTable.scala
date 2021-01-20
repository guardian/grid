package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.scanamo._
import com.gu.scanamo.syntax._
import model.{UploadStatus, UploadStatusRecord}

import scala.concurrent.ExecutionContext.Implicits.global

class UploadStatusTable(config: ImageLoaderConfig) extends DynamoDB(config, config.uploadStatusTable) {

  private val uploadStatusTable = Table[UploadStatusRecord](config.uploadStatusTable)

  def getStatus(imageId: String) = {
    ScanamoAsync.exec(client)(uploadStatusTable.get('id -> imageId))
  }

  def setStatus(uploadStatus: UploadStatusRecord) = {
    ScanamoAsync.exec(client)(uploadStatusTable.put(uploadStatus))
  }

  def updateStatus(imageId: String, updateRequest: UploadStatus) = {
    val updateExpression = updateRequest.errorMessage match {
      case Some(error) => set('status -> updateRequest.status) and set('errorMessages -> error)
      case None => set('status -> updateRequest.status)
    }
    ScanamoAsync.exec(client)(uploadStatusTable.update(
      'id -> imageId,
      expression = updateExpression
    ))
  }
}
