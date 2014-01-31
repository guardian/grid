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

  val cropSourceForm: Form[CropSource] = Form(
    tuple("source" -> nonEmptyText, "x" -> number, "y" -> number, "w" -> number, "h" -> number)
      .transform[CropSource]({ case (source, x, y, w, h) => CropSource(source, Bounds(x, y, w, h)) },
                       { case CropSource(source, Bounds(x, y, w, h)) => (source, x, y, w, h) })
  )

  def crop = Authenticated.async { req =>
    cropSourceForm.bindFromRequest()(req).fold(
      errors => Future.successful(BadRequest(errors.errorsAsJson)),
      crop   => createSizings(crop).map(sizings => Ok(cropResponse(crop, sizings)))
    )
  }

  def createSizings(source: CropSource): Future[List[CropSizing]] =
    for {
      apiResp    <- WS.url(source.uri).withHeaders("X-Gu-Media-Key" -> Config.mediaApiKey).get
      sourceImg   = apiResp.json.as[SourceImage]
      sourceFile <- tempFileFromURL(new URL(sourceImg.file), "cropSource", "")
      Bounds(_, _, masterW, masterH) = source.bounds
      aspect     = masterW.toFloat / masterH
      expiration = DateTime.now.plusMinutes(15)
      outputDims = Dimensions(masterW, masterH) ::
                     Config.standardImageWidths.filter(_ < masterW).map(w => Dimensions(w, math.round(aspect * w)))
      sizings   <- Future.traverse(outputDims) { dim =>
        val filename = outputFilename(sourceImg, source.bounds, dim.width)
        for {
          file <- Crops.create(sourceFile, source, dim)
          url  <- CropStorage.storeCropSizing(file, filename, source, dim)
          _    <- delete(file)
        }
        yield {
          val secureUrl = CropStorage.signUrl(Config.cropBucket, filename, expiration)
          CropSizing(url.toExternalForm, dim, Some(secureUrl))
        }
      }
      _ <- delete(sourceFile)
    }
    yield sizings

  def cropResponse(source: CropSource, sizings: List[CropSizing]): JsValue =
    Json.obj("source" -> source, "sizings" -> sizings)

  def outputFilename(source: SourceImage, bounds: Bounds, outputWidth: Int): String =
    s"${source.id}/${bounds.x}_${bounds.y}_${bounds.width}_${bounds.height}/$outputWidth.jpg"

}

case class SourceImage(id: String, file: String)

object SourceImage {
  import _root_.play.api.libs.functional.syntax._

  implicit val readsSourceImage: Reads[SourceImage] =
    ((__ \ "data" \ "id").read[String] ~ (__ \ "data" \ "secureUrl").read[String])(SourceImage.apply _)
}
