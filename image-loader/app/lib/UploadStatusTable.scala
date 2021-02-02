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

  def setStatus(imageId: String, uploadStatus: UploadStatus) = {
    jsonAdd(imageId, key, caseClassToMap(uploadStatus))
  }
}
