package controllers

import java.net.{URI, URL}

import scala.concurrent.Future

import _root_.play.api.data._, Forms._
import _root_.play.api.mvc.{Action, Controller}
import _root_.play.api.libs.json._
import _root_.play.api.libs.concurrent.Execution.Implicits._
import _root_.play.api.libs.ws.WS
import _root_.play.api.Logger
import _root_.play.api.Play.current

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.{AuthenticatedService, PandaUser, KeyStore}
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.model.SourceImage

import org.joda.time.DateTime

import lib.imaging.ExportResult

import lib._, Files._
import model._


object Application extends Controller with ArgoHelpers {

  import Config.{rootUri, loginUri, kahunaUri}

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, loginUri, kahunaUri)

  val mediaApiKey = keyStore.findKey("cropper").getOrElse(throw new Error("Missing cropper API key in key bucket"))

  val indexResponse = {
    val indexData = Map("description" -> "This is the Cropper Service")
    val indexLinks = List(
      Link("crop", s"$rootUri/crops")
    )
    respond(indexData, indexLinks)
  }

  def index = Authenticated { indexResponse }


  val cropSourceForm: Form[CropSource] = Form(
    tuple("source" -> nonEmptyText, "x" -> number, "y" -> number, "width" -> number, "height" -> number, "aspectRatio" -> optional(nonEmptyText))
      .transform[CropSource]({ case (source, x, y, w, h, r) => CropSource(source, Bounds(x, y, w, h), r) },
                       { case CropSource(source, Bounds(x, y, w, h), r) => (source, x, y, w, h, r) })
  )

  def crop = Authenticated.async { httpRequest =>

    val author: Option[String] = httpRequest.user match {
      case user: AuthenticatedService => Some(user.name)
      case user: PandaUser => Some(user.email)
    }

    cropSourceForm.bindFromRequest()(httpRequest).fold(
      errors   => Future.successful(BadRequest(errors.errorsAsJson)),
      cropSrc  => {

        val crop = Crop(
          by = author,
          timeRequested = Some(new DateTime()),
          specification = cropSrc
        )

        val export = for {
          apiImage <- fetchSourceFromApi(crop.specification.uri)
          _        <- if (apiImage.valid) Future.successful(()) else Future.failed(InvalidImage)
          export   <- Crops.export(apiImage, crop)
        } yield export

        export.map { case ExportResult(id, masterSizing, sizings) =>
          val cropJson = Json.toJson(Crop(crop, masterSizing, sizings)).as[JsObject]
          val exports  = Json.obj(
            "id" -> id,
            "data" -> Json.arr(Json.obj("type" -> "crop") ++ cropJson)
          )

          Notifications.publish(exports, "update-image-exports")
          Ok(cropJson).as(ArgoMediaType)
        } recover {
          case InvalidImage => respondError(BadRequest, "invalid-image", InvalidImage.getMessage)
          case MissingSecureSourceUrl => respondError(BadRequest, "no-source-image", MissingSecureSourceUrl.getMessage)
        }
      }
    )
  }

  def getCrops(id: String) = Authenticated.async { httpRequest =>
    CropStorage.listCrops(id) map (_.toList) map { crops =>

      val all = crops.map(Json.toJson(_).as[JsObject])
      val links = for {
        crop <- crops.headOption
        link = Json.obj("rel" -> "image", "href" -> crop.specification.uri)
      } yield Json.obj("links" -> Json.arr(link))

      val entity = Json.obj(
        "data" -> all
      ) ++ (links getOrElse Json.obj())

      Ok(entity).as(ArgoMediaType)
    }
  }

  def fetchSourceFromApi(uri: String): Future[SourceImage] =
    for (resp <- WS.url(uri).withHeaders("X-Gu-Media-Key" -> mediaApiKey).get)
    yield {
      if (resp.status != 200) Logger.warn(s"HTTP status ${resp.status} ${resp.statusText} from $uri")
      resp.json.as[SourceImage]
    }
}
