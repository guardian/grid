package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import model.UploadStatus

import com.gu.scanamo._
import com.gu.scanamo.syntax._

import scala.concurrent.ExecutionContext.Implicits.global


class UploadStatusTable(config: ImageLoaderConfig) extends DynamoDB(config, config.uploadStatusTable) {

  val key = "uploadStatus"

  private val uploadStatusTable = Table[UploadStatus](config.uploadStatusTable)

  def getStatus(imageId: String) = {
    Scanamo.exec(client)(uploadStatusTable.get('id -> imageId)).flatMap(_.toOption)
  }

  def setStatus(imageId: String, uploadStatus: UploadStatus) = {
    ScanamoAsync.exec(client)(uploadStatusTable.put(uploadStatus))
  }
}
