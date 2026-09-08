package controllers

import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.auth.{Authentication, BaseControllerWithLoginRedirects}
import com.gu.mediaservice.lib.config.Services
import lib.LiveContentApi
import model.{ContentWithImages, ImageTakedownDummyData}
import play.api.mvc.ControllerComponents

import scala.concurrent.{ExecutionContext, Future}

class ImageTakedownController(liveContentApi: LiveContentApi,
                              gridClient: GridClient,
                               override val auth: Authentication,
                              override val services: Services,
                              override val controllerComponents: ControllerComponents
                             )(
                               implicit val ec: ExecutionContext
                             ) extends BaseControllerWithLoginRedirects {


    def index(imageId: Option[String]) = withLoginRedirectAsync { implicit request =>
      imageId.map(id => {
        for {
          contentWithImages <- liveContentApi.findContentUsingImage(id)
          crops <- gridClient.getCrops(id, auth.innerServiceCall)
          usages <- gridClient.getUsages(id, auth.innerServiceCall)
        } yield {
          Ok(views.html.imageTakedown(Some(id), ImageTakedownDummyData.contentWithImages, ImageTakedownDummyData.crops, ImageTakedownDummyData.usages))
        }
      }).getOrElse(Future.successful(Ok(views.html.imageTakedown(None, Nil, Nil, Nil))))

    }

  def takedownImage = withLoginRedirect { implicit request =>
    val imageId = request.body.asFormUrlEncoded.flatMap(_.get("imageId").flatMap(_.headOption))
    Redirect(controllers.routes.ImageTakedownController.index(imageId)).flashing("success" -> "Image takedown request submitted successfully.")
  }

  def deleteImageTakedown(imageId: String) = withLoginRedirectAsync { implicit request =>
    for {
      cropsRes <- gridClient.deleteCrops(imageId, auth.innerServiceCall)
      usagesRes <- gridClient.deleteUsages(imageId, auth.innerServiceCall)
      message = if (cropsRes && usagesRes) {
        "Crops and Usages deleted successfully"
      } else {
        s"Encountered issues while deleting crops and usages"
      }
    } yield Redirect(controllers.routes.ImageTakedownController.index(None)).flashing("response" -> message)
  }
}
