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
import model.{CropMetadata, Dimensions, Crop}
import lib.Bounds

object Application extends Controller {

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val Authenticated = auth.Authenticated(keyStore)(_ => Unauthorized(Json.obj("errorKey" -> "unauthorized")))

  def index = Action {
    Ok("This is the Crop Service.\n")
  }

  val boundsForm =
    Form(tuple("source" -> nonEmptyText, "x" -> number, "y" -> number, "w" -> number, "h" -> number))

  def crop = Authenticated.async { req =>

    boundsForm.bindFromRequest()(req).fold(
      errors => Future.successful(BadRequest(errors.errorsAsJson)),
      {
        case (source, x, y, w, h) =>
          for {
            apiResp <- WS.url(source).withHeaders("X-Gu-Media-Key" -> Config.mediaApiKey).get
            SourceImage(id, file) = apiResp.json.as[SourceImage]
            filename = s"$id/${x}_${y}_${w}_$h.jpg"
            tempFile <- Crops.crop(new URI(file), Bounds(x, y, w, h))
            meta = CropMetadata(source, x, y, Dimensions(w, h))
            file <- CropStorage.storeCrop(tempFile, filename, meta) <| (_.onComplete { case _ => tempFile.delete })
          } yield {
            val expiration = DateTime.now.plusMinutes(15)
            val secureUrl = CropStorage.signUrl(Config.cropBucket, filename, expiration)
            val crop = Crop(file.toExternalForm, meta, secureUrl)
            val response = Json.toJson(crop)
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
