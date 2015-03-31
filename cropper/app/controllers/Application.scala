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

import org.joda.time.DateTime

import lib._, Files._
import model._


case object InvalidImage extends Exception("Invalid image cannot be cropped")

object Application extends Controller with ArgoHelpers {

  import Config.{rootUri, loginUri, kahunaUri}

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, loginUri, kahunaUri)

  val mediaApiKey = keyStore.findKey("cropper").getOrElse(throw new Error("Missing cropper API key in key bucket"))

  def index = Action {
    val response = Json.obj(
      "data"  -> Json.obj("description" -> "This is the Cropper Service"),
      "links" -> Json.arr(
        Json.obj("rel" -> "crop", "href" -> s"$rootUri/crops")
      )
    )
    Ok(response).as(ArgoMediaType)
  }

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
      cropSrc => {
        val crop = Crop(
          by = author,
          timeRequested = Some(new DateTime()),
          specification = cropSrc
        )

        createSizings(crop).map { case (id, sizings) =>

          val cropJson = cropResponse(Crop(crop, sizings))
          val exports = Json.obj(
            "id" -> id,
            "data" -> Json.arr(Json.obj("type" -> "crop") ++ cropJson)
          )

          Notifications.publish(exports, "update-image-exports")
          Ok(cropJson).as(ArgoMediaType)
        } recover {
          case InvalidImage => respondError(BadRequest, "invalid-image", "Invalid image cannot be cropped")
        }
      }
    )
  }

  def getCrops(id: String) = Authenticated.async { httpRequest =>
    CropStorage.listCrops(id) map (_.toList) map { crops =>

      val all = crops.map(cropResponse)
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

  def createSizings(crop: Crop): Future[(String, List[CropSizing])] = {
    val source = crop.specification

    for {
      apiImage   <- fetchSourceFromApi(source.uri)
      // Only allow cropping if image is valid, else exit
      _          <- if (apiImage.valid) Future.successful(()) else Future.failed(InvalidImage)
      sourceFile <- tempFileFromURL(new URL(apiImage.source.secureUrl), "cropSource", "")

      metadata   = apiImage.metadata
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
          file    <- Crops.create(sourceFile, source, dim, metadata)
          sizing  <- CropStorage.storeCropSizing(file, filename, "image/jpeg", crop, dim)
          _       <- delete(file)
        }
        yield sizing
      }
      _ <- delete(sourceFile)
    }
    yield (apiImage.id, sizings)
  }

  def fetchSourceFromApi(uri: String): Future[SourceImage] =
    for (resp <- WS.url(uri).withHeaders("X-Gu-Media-Key" -> mediaApiKey).get)
    yield {
      if (resp.status != 200) Logger.warn(s"HTTP status ${resp.status} ${resp.statusText} from $uri")
      resp.json.as[SourceImage]
    }

  def cropResponse(crop: Crop): JsObject =
    Json.toJson(crop).as[JsObject].transform(transformers.addSecureUrlToAssets).get

  object transformers {

    // Slightly tedious transform to add secureUrl to each asset
    def addSecureUrlToAssets: Reads[JsObject] =
      (__ \ "assets").json.update(__.read[JsArray].map { array =>
        JsArray(array.value.map(_.transform(addSecureUrl).get))
      })

    def addSecureUrl: Reads[JsObject] =
      __.json.update(__.read[JsObject].map { asset =>
        val url = (asset \ "file").as[String]
        getSecureCropUri(url) match {
          case Some(secureUrl) => asset ++ Json.obj("secureUrl" -> secureUrl)
          case None            => asset
        }
      })
  }


  def getSecureCropUri(uri: String): Option[String] =
    for {
      secureHost <- Config.imgPublishingSecureHost
      cropUri     = URI.create(uri)
      secureUri   = new URI("https", secureHost, cropUri.getPath, cropUri.getFragment)
    } yield secureUri.toString


  def outputFilename(source: SourceImage, bounds: Bounds, outputWidth: Int): String = {
    s"${source.id}/${Crop.getCropId(bounds)}/$outputWidth.jpg"
  }

}
