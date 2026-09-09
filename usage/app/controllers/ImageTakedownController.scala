package controllers

import cache.{ImageDecacheResult, ImageServices}
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.auth.{Authentication, BaseControllerWithLoginRedirects}
import com.gu.mediaservice.lib.config.Services
import lib.LiveContentApi
import model.{ImageTakedown, Pending, TakedownStore}
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.Json
import play.api.mvc.ControllerComponents

import scala.concurrent.{ExecutionContext, Future}

class ImageTakedownController(liveContentApi: LiveContentApi,
                              gridClient: GridClient,
                              imageServices: ImageServices,
                               override val auth: Authentication,
                              override val services: Services,
                              override val controllerComponents: ControllerComponents
                             )(
                               implicit val ec: ExecutionContext
                             ) extends BaseControllerWithLoginRedirects {

  val takedownstore = TakedownStore(Map.empty[String, ImageTakedown])

  private val takedownLogger = Logger(getClass)

    def index(imageId: Option[String]) = withLoginRedirectAsync { implicit request =>
      imageId.map(id => {
        for {
          contentWithImages <- liveContentApi.findContentUsingImage(id)
          crops <- gridClient.getCrops(id, auth.innerServiceCall)
          usages <- gridClient.getUsages(id, auth.innerServiceCall)
          softDeleteMetadata <- gridClient.getSoftDeletedMetadata(id, auth.innerServiceCall)
        } yield {
          Ok(views.html.imageTakedown(Some(id), contentWithImages, crops, usages, softDeleteMetadata, takedownstore.get(id)))
        }
      }).getOrElse(Future.successful(Ok(views.html.imageTakedown(None, Nil, Nil, Nil, None, None))))
    }

  def takedownImagePage = withLoginRedirect { implicit request =>
    val imageId = request.body.asFormUrlEncoded.flatMap(_.get("imageId").flatMap(_.headOption))
    Redirect(controllers.routes.ImageTakedownController.index(imageId)).flashing("success" -> "Image takedown request submitted successfully.")
  }

  def imageTakedown(imageId: String) = withLoginRedirectAsync { implicit request =>
    for {
      crops <- gridClient.getCrops(imageId, auth.innerServiceCall)
      cropUrls = crops.flatMap(c => {c.assets.map(a =>a.file)})
    } yield {
      val newTakedown = ImageTakedown(imageId, cropUrls)
      takedownstore.add(newTakedown)
      val takedownRun = new model.TakedownRun(gridClient, auth, imageServices, takedownstore)
      takedownRun.run(newTakedown)
      Redirect(controllers.routes.ImageTakedownController.index(Some(imageId)))
    }
  }

  def deleteImageTakedown(imageId: String) = withLoginRedirectAsync { implicit request =>
    for {
      cropsRes <- gridClient.deleteCrops(imageId, auth.innerServiceCall)
      usagesRes <- gridClient.deleteUsages(imageId, auth.innerServiceCall)
      imageRes <- gridClient.deleteImage(imageId, auth.innerServiceCall)
      message = if (cropsRes && usagesRes && imageRes) {
        "Crops and Usages and Image deleted successfully"
      } else {
        s"Encountered issues while deleting image"
      }
      _ = takedownLogger.info(s"Image takedown for $imageId completed: $message")
    } yield Redirect(controllers.routes.ImageTakedownController.index(Some(imageId))).flashing("response" -> message)
  }

  def decache(imageId: String) = withLoginRedirectAsync { implicit request =>
    for {
      crops <- gridClient.getCrops(imageId, auth.innerServiceCall)
      // TODO include the master image?
      cropUrls = crops.flatMap(c => {c.assets.map(a =>a.file)})
      _ <- Future.sequence(cropUrls.map(c => imageServices.clearFastly(c)))
      ds <- Future.sequence(cropUrls.map(c => imageServices.validateDecache(c)))
      cacheResults = ImageDecacheResult(ds)
    } yield {
      if(cacheResults.hasErrors) {
        takedownLogger.error(s"Unexpected responses while decaching image $imageId: ${cacheResults.errors.mkString(", ")}")
      }
      if(cacheResults.hasUncleared) {
        takedownLogger.warn(s"Some crop urls were not cleared while decaching image $imageId: ${cacheResults.uncleared.mkString(", ")}")
      }
      val message = if(cacheResults.allUrlsCleared) "Successfully decached all crop urls" else s"There were some issues purging the cache, please try again"
      Redirect(controllers.routes.ImageTakedownController.index(Some(imageId))).flashing("response" -> message)
    }
  }
}
