package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.model.Image
import com.gu.mediaservice.model.Image._
import com.gu.mediaservice.{ImageDataMerger, ImageDataMergerConfig}
import lib.AdminToolsConfig
import play.api.libs.json.Json
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.{ExecutionContext, Future}

class AdminToolsCtr(config: AdminToolsConfig, override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  private val cfg = ImageDataMergerConfig(
    apiKey = config.apiKey,
    imgLoaderApiBaseUri = config.services.loaderBaseUri,
    collectionsApiBaseUri = config.services.collectionsBaseUri,
    metadataApiBaseUri = config.services.metadataBaseUri,
    cropperApiBaseUri = config.services.cropperBaseUri,
    leasesApiBaseUri = config.services.leasesBaseUri,
    usageBaseApiUri = config.services.usageBaseUri
  )

  private val merger = new ImageDataMerger(cfg)

  private val indexResponse = {
    val indexData = Json.obj(
      "description" -> "This is Admin tools API"
    )
    val indexLinks = List(
      Link("image-projection", s"${config.rootUri}/images/{id}/project")
    )
    respond(indexData, indexLinks)
  }

  def index = Action {
    indexResponse
  }

  def project(mediaId: String) = Action.async {
    val maybeImageFuture: Option[Future[Image]] = merger.getMergedImageData(mediaId)
    maybeImageFuture match {
      case Some(imageFuture) =>
        imageFuture.map { image =>
          Ok(Json.toJson(image)).as(ArgoMediaType)
        }
      case None => Future(NotFound)
    }
  }
}
