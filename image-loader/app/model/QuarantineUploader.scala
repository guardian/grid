package model


import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.aws.{S3Object, UpdateMessage}
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.{LogMarker, Stopwatch, addLogMarkers}
import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.lib.resource.FutureResources._
import com.gu.mediaservice.model._
import lib.ImageLoaderConfig
import lib.storage.QuarantineStore
import net.logstash.logback.marker.LogstashMarker
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.{JsObject, Json}
import com.gu.mediaservice.lib.formatting._
import model.upload.UploadRequest
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import scala.concurrent.{ExecutionContext, Future}

class QuarantineUploader(val store: QuarantineStore,
               val config: ImageLoaderConfig)
              (implicit val ec: ExecutionContext) extends ArgoHelpers {

  private def storeQuarantineFile(uploadRequest: UploadRequest)
                         (implicit logMarker: LogMarker) = {
    val meta = Uploader.toMetaMap(uploadRequest)
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
      uri = s"${config.rootUri}/uploadStatus/${uploadRequest.imageId}"
    } yield {
      Json.obj("uri" -> uri)
    }
  }
}