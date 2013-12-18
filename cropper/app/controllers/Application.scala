package controllers

import java.net.URI
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
import model.{Dimensions, Crop}
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
            cropFilename = s"$id/${x}_${y}_${w}_$h.jpg"
            tempFile <- Crops.crop(new URI(file), Bounds(x, y, w, h))
            file <- S3Storage.store(Config.cropBucket, cropFilename, tempFile) <|
                  (_.onComplete { case _ => tempFile.delete })
          } yield {
            val expiration = DateTime.now.plusMinutes(15)
            val secureUrl = S3Storage.signUrl(Config.cropBucket, cropFilename, expiration)
            val response = Json.toJson(Crop(source, x, y, Dimensions(w, h), file.toExternalForm, secureUrl))
            // Notifications.publish(response, "crop")
            Ok(Json.toJson(response))
          }
      }
    )

  }

  def nonHttpsUri(uri: URI): URI =
    new URI("http", uri.getUserInfo, uri.getHost, uri.getPort, uri.getPath, uri.getQuery, uri.getFragment)

}

case class SourceImage(id: String, file: String)

object SourceImage {
  import _root_.play.api.libs.functional.syntax._

  implicit val readsSourceImage: Reads[SourceImage] =
    ((__ \ "data" \ "id").read[String] ~ (__ \ "data" \ "secureUrl").read[String])(SourceImage.apply _)
}
