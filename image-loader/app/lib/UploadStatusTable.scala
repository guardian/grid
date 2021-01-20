package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.lib.aws.DynamoDB.caseClassToMap
import model.UploadStatus

import scala.concurrent.ExecutionContext.Implicits.global


class UploadStatusTable(config: ImageLoaderConfig) extends DynamoDB(config, config.uploadStatusTable) {

  val key = "uploadStatus"

  def getStatus(imageId: String) = {
    jsonGet(imageId, key) map { dynamoEntry =>
      (dynamoEntry \ key ).toOption
    }
  }

  def setStatus(uploadStatus: UploadStatus) = {
    jsonAdd(uploadStatus.id, key, caseClassToMap(uploadStatus))
  }
}
