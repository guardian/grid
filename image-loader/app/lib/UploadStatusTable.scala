package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import model.{UpdateUploadStatusRequest, UploadStatus}
import com.gu.scanamo._
import com.gu.scanamo.syntax._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future


class UploadStatusTable(config: ImageLoaderConfig) extends DynamoDB(config, config.uploadStatusTable) {

  val key = "uploadStatus"

  private val uploadStatusTable = Table[UploadStatus](config.uploadStatusTable)

  def getStatus(imageId: String) = {
    ScanamoAsync.exec(client)(uploadStatusTable.get('id -> imageId))
  }

  def setStatus(uploadStatus: UploadStatus) = {
    ScanamoAsync.exec(client)(uploadStatusTable.put(uploadStatus))
  }

  def updateStatus(imageId: String, updateRequest: UpdateUploadStatusRequest) = {
    getStatus(imageId).
      flatMap {
        case Some(Right(uploadStatus)) => {
          ScanamoAsync.exec(client)(uploadStatusTable.put(uploadStatus.copy(status = updateRequest.status, errorMessages = updateRequest.errorMessages)))
        }
        case dynamoResponse => Future.successful(dynamoResponse)
      }
  }
}
