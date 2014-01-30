package controllers

import java.net.{URL, URI}
import scala.concurrent.Future

import _root_.play.api.data._, Forms._
import _root_.play.api.mvc.{Action, Controller}
import _root_.play.api.libs.json._
import _root_.play.api.libs.concurrent.Execution.Implicits._
import _root_.play.api.libs.ws.WS
import scalaz.syntax.id._

import org.joda.time.DateTime
import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore
import lib._
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
          SourceImage(id, file) = apiResp.json.as[SourceImage]
          tempFile <- Crops.create(new URI(file), bounds)
          filename = s"$id/${x}_${y}_${w}_$h.jpg"
          masterFile <- CropStorage.storeCropSizing(tempFile, filename, crop) <| (_.onComplete { case _ => tempFile.delete })
        } yield {
          val expiration = DateTime.now.plusMinutes(15)
          val secureUrl = CropStorage.signUrl(Config.cropBucket, filename, expiration)
          val masterSizing = CropSizing(masterFile.toExternalForm, crop, Dimensions(w, h), Some(secureUrl))
          val response = Json.toJson(masterSizing)
          // Notifications.publish(response, "crop")
          Ok(Json.toJson(response))
        }
      }
    )

  }

}

case class SourceImage(id: String, file: String)

object SourceImage {
  import _root_.play.api.libs.functional.syntax._

  implicit val readsSourceImage: Reads[SourceImage] =
    ((__ \ "data" \ "id").read[String] ~ (__ \ "data" \ "secureUrl").read[String])(SourceImage.apply _)
}
