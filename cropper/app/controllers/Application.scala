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
  val Authenticated = auth.Authenticated(keyStore, Config.kahunaUri)

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
      errors   => Future.successful(BadRequest(errors.errorsAsJson)),
      cropReq => {
        createSizings(cropReq).map { case (id, sizings) =>
          val json = cropResponse(Crop(cropReq, sizings))
          // TODO: make this a reusable case class / model
          val message = Json.obj("id" -> id, "exports" -> Json.arr(Json.obj("type" -> "crop") ++ json))
          Notifications.publish(message, "add-exports-to-image")
          Ok(json)
        }
      }
    )
  }

  def getCrops(id: String) = Authenticated.async { req =>
    CropStorage.listCrops(id) map (_.toList) map { crops =>
      val all = crops.map { case (source, sizings) => cropResponse(Crop(source, sizings)) }

      val links = for {
        (firstCropSource, _) <- crops.headOption
        link = Json.obj("rel" -> "image", "href" -> firstCropSource.uri)
      } yield Json.obj("links" -> Json.arr(link))

      val entity = Json.obj(
        "data" -> all
      ) ++ (links getOrElse Json.obj())
      Ok(entity)
    }
  }

  def createSizings(source: CropSource): Future[(String, List[CropSizing])] =
    for {
      apiImage   <- fetchSourceFromApi(source.uri)
      sourceFile <- tempFileFromURL(new URL(apiImage.source.secureUrl), "cropSource", "")

      Bounds(_, _, masterW, masterH) = source.bounds
      aspect     = masterW.toFloat / masterH
      portrait   = masterW < masterH
      outputDims = if (portrait)
        Config.portraitCropSizingHeights.filter(_ <= masterH).map(h => Dimensions(math.round(h * aspect), h))
      else
        Config.landscapeCropSizingWidths.filter(_ <= masterW).map(w => Dimensions(w, math.round(w / aspect)))

      sizings <- Future.traverse(outputDims) { dim =>
        val filename = outputFilename(apiImage, source.bounds, dim.width)
        for {
          file    <- Crops.create(sourceFile, source, dim)
          sizing  <- CropStorage.storeCropSizing(file, filename, "image/jpeg", source, dim)
          _       <- delete(file)
        }
        yield sizing
      }
      _ <- delete(sourceFile)
    }
    yield (apiSource.id, sizings)

  def fetchSourceFromApi(uri: String): Future[SourceImage] =
    for (resp <- WS.url(uri).withHeaders("X-Gu-Media-Key" -> mediaApiKey).get)
    yield {
      if (resp.status != 200) Logger.warn(s"HTTP status ${resp.status} ${resp.statusText} from $uri")
      resp.json.as[SourceImage]
    }

  def cropResponse(crop: Crop): JsObject = Json.toJson(crop).as[JsObject]

  def outputFilename(source: SourceImage, bounds: Bounds, outputWidth: Int): String =
    s"${source.id}/${bounds.x}_${bounds.y}_${bounds.width}_${bounds.height}/$outputWidth.jpg"

//  def snsMessage(imageId: String, crop: Crop)
}
