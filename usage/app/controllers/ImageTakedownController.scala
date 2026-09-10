package controllers

import cache.ImageServices
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.auth.{Authentication, BaseControllerWithLoginRedirects}
import com.gu.mediaservice.lib.config.Services
import lib.LiveContentApi
import model.{ContentWithImages, ImageTakedownDummyData, ImageTakedownStore}
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

    val imageUrlsStore = ImageTakedownStore()

    def index(imageId: Option[String]) = withLoginRedirectAsync { implicit request =>
      imageId.map(id => {
        for {
          contentWithImages <- liveContentApi.findContentUsingImage(id)
          crops <- gridClient.getCrops(id, auth.innerServiceCall)
          usages <- gridClient.getUsages(id, auth.innerServiceCall)
          softDeleteMetadata <- gridClient.getSoftDeletedMetadata(id, auth.innerServiceCall)
        } yield {
          Ok(views.html.imageTakedown(Some(id), contentWithImages, crops, usages, softDeleteMetadata))
        }
      }).getOrElse(Future.successful(Ok(views.html.imageTakedown(None, Nil, Nil, Nil, None))))
    }

  def takedownImage = withLoginRedirect { implicit request =>
    val imageId = request.body.asFormUrlEncoded.flatMap(_.get("imageId").flatMap(_.headOption))
    Redirect(controllers.routes.ImageTakedownController.index(imageId)).flashing("success" -> "Image takedown request submitted successfully.")
  }

  def removeImageMetadata(imageId: String) = withLoginRedirectAsync { implicit request =>
    for {
      crops <- gridClient.getCrops(imageId, auth.innerServiceCall)
      _ = imageUrlsStore.addImageUrls(imageId, crops.flatMap(c => {c.assets.map(a =>a.file)}))
      cropsRes <- gridClient.deleteCrops(imageId, auth.innerServiceCall)
      usagesRes <- gridClient.deleteUsages(imageId, auth.innerServiceCall)
      message = if (cropsRes && usagesRes) {
        "Crops and Usages and Image deleted successfully"
      } else {
        s"Encountered issues while deleting image"
      }
    } yield Redirect(controllers.routes.ImageTakedownController.index(Some(imageId))).flashing("response" -> message)
  }

  def deleteImage(imageId: String) = withLoginRedirectAsync { implicit request =>
    val deleteAction = request.body.asFormUrlEncoded
      .flatMap(_.get("deleteAction"))
      .flatMap(_.headOption)

    deleteAction match {
      case Some("soft-delete") =>
        for {
          deleteRes <- gridClient.deleteImage(imageId, auth.innerServiceCall)
          message = if (deleteRes) {
            "Image soft deleted successfully"
          } else {
            "Encountered issues while soft deleting image"
          }
        } yield Redirect(controllers.routes.ImageTakedownController.index(Some(imageId))).flashing("response" -> message)
      case Some("hard-delete")  =>
        for {
          deleteRes <- gridClient.hardDeleteImage(imageId, auth.innerServiceCall)
          message = if (deleteRes) {
            "Image soft deleted successfully"
          } else {
            "Encountered issues while soft deleting image"
          }
        } yield Redirect(controllers.routes.ImageTakedownController.index(Some(imageId))).flashing("response" -> message)

      case Some("deny-lease") =>
        for {
          denyRes <- gridClient.denyLease(imageId, auth.innerServiceCall)
          message = if (denyRes) {
            "Lease denied successfully"
          } else {
            "Encountered issues while denying lease"
          }
        } yield Redirect(controllers.routes.ImageTakedownController.index(Some(imageId))).flashing("response" -> message)
      case _ =>
        Future.successful(
          Redirect(controllers.routes.ImageTakedownController.index(Some(imageId)))
            .flashing("response" -> "Please choose a valid delete action.")
        )
      }
  }

  def decache(imageId: String) = withLoginRedirectAsync { implicit request =>
    val cropUrls = imageUrlsStore.getImageUrls(imageId)
    for {
      _ <- Future.sequence(cropUrls.map(c => imageServices.clearFastly(c)))
    } yield {
      Redirect(controllers.routes.ImageTakedownController.index(Some(imageId))).flashing("response" -> s"Purged from Fastly successfully: ${cropUrls.mkString("\n")}")
    }
  }
}
