package model


import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.logging.LogMarker
import lib.ImageLoaderConfig
import lib.storage.QuarantineStore
import play.api.libs.json.{JsObject, Json}
import model.upload.UploadRequest
import scala.concurrent.{ExecutionContext, Future}

class QuarantineUploader(val store: QuarantineStore,
               val config: ImageLoaderConfig)
              (implicit val ec: ExecutionContext) extends ArgoHelpers {

  private def storeQuarantineFile(uploadRequest: UploadRequest)
                         (implicit logMarker: LogMarker) = {
    val meta = ImageUploadProcessor.toMetaMap(uploadRequest)
    store.storeQuarantineImage(
      uploadRequest.imageId,
      uploadRequest.tempFile,
      uploadRequest.mimeType,
      meta
    )
  }

  def quarantineFile(uploadRequest: UploadRequest)(
    implicit ec: ExecutionContext,
    logMarker: LogMarker): Future[JsObject] = {

    logger.info("Quarantining file")

    for {
      _ <- storeQuarantineFile(uploadRequest)
      uri = s"${config.apiUri}/images/${uploadRequest.imageId}"
    } yield {
      Json.obj("uri" -> uri)
    }
  }
}
