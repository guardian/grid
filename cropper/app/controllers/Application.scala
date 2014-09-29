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
import com.gu.mediaservice.lib.auth.KeyStore
import lib._, Files._
import model._


object Application extends Controller {

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val Authenticated = auth.Authenticated(keyStore)(_ => Unauthorized(Json.obj("errorKey" -> "unauthorized")))

  val mediaApiKey = keyStore.findKey("cropper").getOrElse(throw new Error("Missing cropper API key in key bucket"))

  val rootUri = Config.rootUri

  def index = Action {
    val response = Json.obj(
      "data"  -> Json.obj("description" -> "This is the Cropper Service"),
      "links" -> Json.arr(
        Json.obj("rel" -> "crop", "href" -> s"$rootUri/crops")
      )
    )
    Ok(response)
  }

  val cropSourceForm: Form[CropSource] = Form(
    tuple("source" -> nonEmptyText, "x" -> number, "y" -> number, "width" -> number, "height" -> number, "aspectRatio" -> optional(nonEmptyText))
      .transform[CropSource]({ case (source, x, y, w, h, r) => CropSource(source, Bounds(x, y, w, h), r) },
                       { case CropSource(source, Bounds(x, y, w, h), r) => (source, x, y, w, h, r) })
  )

  def crop = Authenticated.async { req =>
    cropSourceForm.bindFromRequest()(req).fold(
      errors => Future.successful(BadRequest(errors.errorsAsJson)),
      crop   => createSizings(crop).map(sizings => Ok(cropResponse(crop, sizings)))
    )
  }

  def getCrops(id: String) = Authenticated.async { req =>
    CropStorage.listCrops(id) map (_.toList) map { crops =>
      val all = crops.map { case (cropSource, cropSizings) =>
        Json.obj(
          "source"  -> cropSource,
          "sizings" -> cropSizings
        )
      }
      val imageUri = crops.headOption.map {case (cropSource, _) => cropSource.uri}
      val entity = Json.obj(
        "data" -> all,
        "links" -> Json.arr(
          Json.obj("rel" -> "image", "href" -> imageUri)
        )
      )
      Ok(entity)
    }
  }

  def createSizings(source: CropSource): Future[List[CropSizing]] =
    for {
      apiSource  <- fetchSourceFromApi(source.uri)
      sourceFile <- tempFileFromURL(new URL(apiSource.file), "cropSource", "")

      Bounds(_, _, masterW, masterH) = source.bounds
      aspect     = masterW.toFloat / masterH
      portrait   = masterW < masterH
      outputDims = if (portrait)
        Config.portraitCropSizingHeights.filter(_ <= masterH).map(h => Dimensions(math.round(h * aspect), h))
      else
        Config.landscapeCropSizingWidths.filter(_ <= masterW).map(w => Dimensions(w, math.round(w / aspect)))

      sizings <- Future.traverse(outputDims) { dim =>
        val filename = outputFilename(apiSource, source.bounds, dim.width)
        for {
          file    <- Crops.create(sourceFile, source, dim)
          sizing  <- CropStorage.storeCropSizing(file, filename, "image/jpeg", source, dim)
          _       <- delete(file)
        }
        yield sizing
      }
      _ <- delete(sourceFile)
    }
    yield sizings

  def fetchSourceFromApi(uri: String): Future[SourceImage] =
    for (resp <- WS.url(uri).withHeaders("X-Gu-Media-Key" -> mediaApiKey).get)
    yield {
      if (resp.status != 200) Logger.warn(s"HTTP status ${resp.status} ${resp.statusText} from $uri")
      resp.json.as[SourceImage]
    }

  def cropResponse(source: CropSource, sizings: List[CropSizing]): JsValue =
    Json.obj(
      "source" -> source,
      "sizings" -> sizings
    )

  def outputFilename(source: SourceImage, bounds: Bounds, outputWidth: Int): String =
    s"${source.id}/${bounds.x}_${bounds.y}_${bounds.width}_${bounds.height}/$outputWidth.jpg"
}

case class SourceImage(id: String, file: String)

object SourceImage {
  import _root_.play.api.libs.functional.syntax._

  implicit val readsSourceImage: Reads[SourceImage] =
    ((__ \ "data" \ "id").read[String] ~ (__ \ "data" \ "secureUrl").read[String])(SourceImage.apply _)
}
