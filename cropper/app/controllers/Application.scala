package controllers

import java.net.URL
import scala.concurrent.Future

import _root_.play.api.data._, Forms._
import _root_.play.api.mvc.{Action, Controller}
import _root_.play.api.libs.json._
import _root_.play.api.libs.concurrent.Execution.Implicits._
import _root_.play.api.libs.ws.WS
import org.joda.time.DateTime

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore
import lib._, Files._
import model._


object Application extends Controller {

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val Authenticated = auth.Authenticated(keyStore)(_ => Unauthorized(Json.obj("errorKey" -> "unauthorized")))

  def index = Action {
    Ok("This is the Crop Service.\n")
  }

  val cropSourceForm: Form[Crop] = Form(
    tuple("source" -> nonEmptyText, "x" -> number, "y" -> number, "w" -> number, "h" -> number)
      .transform[Crop]({ case (source, x, y, w, h) => Crop(source, Bounds(x, y, w, h)) },
                       { case Crop(source, Bounds(x, y, w, h)) => (source, x, y, w, h) })
  )

  def crop = Authenticated.async { req =>
    cropSourceForm.bindFromRequest()(req).fold(
      errors => Future.successful(BadRequest(errors.errorsAsJson)),
      crop   => createSizings(crop).map(sizings => Ok(cropResponse(sizings)))
    )
  }

  def createSizings(crop: Crop): Future[List[CropSizing]] =
    for {
      apiResp    <- WS.url(crop.source).withHeaders("X-Gu-Media-Key" -> Config.mediaApiKey).get
      sourceImg   = apiResp.json.as[SourceImage]
      sourceFile <- tempFileFromURL(new URL(sourceImg.file), "cropSource", "")
      Bounds(_, _, masterW, masterH) = crop.bounds
      aspect     = masterW / masterH
      expiration = DateTime.now.plusMinutes(15)
      outputDims = Dimensions(masterW, masterH) :: Config.standardImageWidths.map(w => Dimensions(w, aspect * w))
      sizings   <- Future.traverse(outputDims) { dim =>
        val filename = outputFilename(sourceImg, crop.bounds, dim.width)
        for {
          file <- Crops.create(sourceFile, crop, dim)
          url  <- CropStorage.storeCropSizing(file, filename, crop, dim)
          _    <- delete(file)
        }
        yield {
          val secureUrl = CropStorage.signUrl(Config.cropBucket, filename, expiration)
          CropSizing(url.toExternalForm, crop, dim, Some(secureUrl))
        }
      }
      _ <- delete(sourceFile)
    }
    yield sizings

  def cropResponse(sizings: List[CropSizing]): JsValue =
    Json.obj("sizings" -> sizings)

  def outputFilename(source: SourceImage, bounds: Bounds, outputWidth: Int): String =
    s"${source.id}/${bounds.x}_${bounds.y}_${bounds.width}_${bounds.height}/$outputWidth.jpg"

}

case class SourceImage(id: String, file: String)

object SourceImage {
  import _root_.play.api.libs.functional.syntax._

  implicit val readsSourceImage: Reads[SourceImage] =
    ((__ \ "data" \ "id").read[String] ~ (__ \ "data" \ "secureUrl").read[String])(SourceImage.apply _)
}
