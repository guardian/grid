package controllers

import java.net.{URL, URI}
import scala.concurrent.Future

import _root_.play.api.data._, Forms._
import _root_.play.api.mvc.{Action, Controller}
import _root_.play.api.libs.json._
import _root_.play.api.libs.concurrent.Execution.Implicits._
import _root_.play.api.libs.ws.WS
import org.joda.time.DateTime
import scalaz.syntax.id._

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
      { case crop @ Crop(source, bounds @ Bounds(x, y, w, h)) =>
        for {
          apiResp <- WS.url(source).withHeaders("X-Gu-Media-Key" -> Config.mediaApiKey).get
          sourceImg = apiResp.json.as[SourceImage]
          sourceFile <- tempFileFromURL(new URL(sourceImg.file), "cropSource", "")

          aspect = w / h
          outputDimensions = Dimensions(w, h) :: Config.standardImageWidths.map(w => Dimensions(w, aspect * w))
          outputFiles <- Future.traverse(outputDimensions) { dim =>
                           val filename = outputFilename(sourceImg, bounds, dim.width)
                           Crops.create(sourceFile, crop, dim, filename)
                         }

          _ <- delete(sourceFile)

          outputUrls <- Future.traverse(outputFiles) { case CropOutput(file, filename, dim) =>
            CropStorage.storeCropSizing(file, filename, crop, dim)
          }

          _ <- Future.traverse(outputFiles)(o => delete(o.file))
        } yield {
          val expiration = DateTime.now.plusMinutes(15)

          val sizings = outputFiles.zip(outputUrls) map { case (CropOutput(file, filename, dim), url) =>
            val secureUrl = CropStorage.signUrl(Config.cropBucket, filename, expiration)
            CropSizing(url.toExternalForm, crop, dim, Some(secureUrl))
          }
          Ok(cropResponse(sizings))
        }
      }
    )

  }

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
