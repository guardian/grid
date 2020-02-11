package lib

import com.gu.mediaservice.lib.aws.{BulkIndexRequest, S3}
import com.gu.mediaservice.model.Image
import play.api.Logger
import play.api.libs.json._

class BulkIndexS3Client(config: ThrallConfig) extends S3(config){
  def getImages(request: BulkIndexRequest): List[Image] = {
    getObjectAsString(request.bucket, request.key)
      .map(content => {
        Json.parse(content).validate[List[Image]] match {
          case images: JsSuccess[List[Image]] => images.get
          case _ => {
            val message = s"failed to parse S3 file ${request.bucket}/${request.key} as a list of images"
            Logger.error(message)
            throw new Exception(message)
          }
        }
      })
      .getOrElse(List.empty)
  }
}
