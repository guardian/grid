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

          outputWidths = w :: Config.standardImageWidths
          masterDimensions = Dimensions(w, h)
          filename = outputFilename(sourceImg, bounds, w)

          masterFile <- Crops.create(sourceFile, crop, masterDimensions, filename)
          _ <- delete(sourceFile)
          masterUrl <- CropStorage.storeCropSizing(masterFile, filename, crop, masterDimensions)
        } yield {
          val expiration = DateTime.now.plusMinutes(15)
          val secureUrl = CropStorage.signUrl(Config.cropBucket, filename, expiration)
          val masterSizing = CropSizing(masterUrl.toExternalForm, crop, masterDimensions, Some(secureUrl))
          val response = Json.toJson(masterSizing)
          // Notifications.publish(response, "crop")
          Ok(Json.toJson(response))
        }
      }
    )

  }

  def outputFilename(source: SourceImage, bounds: Bounds, outputWidth: Int): String =
    s"${source.id}/${bounds.x}_${bounds.y}_${bounds.width}_${bounds.height}/$outputWidth.jpg"

}

case class SourceImage(id: String, file: String)

object SourceImage {
  import _root_.play.api.libs.functional.syntax._

  implicit val readsSourceImage: Reads[SourceImage] =
    ((__ \ "data" \ "id").read[String] ~ (__ \ "data" \ "secureUrl").read[String])(SourceImage.apply _)
}
