package controllers

import com.gu.mediaservice.lib.auth.{Authentication, BaseControllerWithLoginRedirects}
import com.gu.mediaservice.lib.config.Services
import lib.LiveContentApi
import model.ContentWithImages
import play.api.mvc.ControllerComponents

import scala.concurrent.{ExecutionContext, Future}

class ImageTakedownController(liveContentApi: LiveContentApi,
                               override val auth: Authentication,
                              override val services: Services,
                              override val controllerComponents: ControllerComponents
                             )(
                               implicit val ec: ExecutionContext
                             ) extends BaseControllerWithLoginRedirects {

    def index(imageId: Option[String]) = withLoginRedirectAsync { implicit request =>
      imageId.map(id => {
        val imageSearchQ = liveContentApi.imageSearch(id)
        for {
          searchResult <- liveContentApi.getResponse(imageSearchQ)
        } yield {
          val contentWithImages = ContentWithImages.processImageSearch(searchResult)
          Ok(views.html.imageTakedown(Some(id), contentWithImages.toList))
        }
      }).getOrElse(Future.successful(Ok(views.html.imageTakedown(None, Nil))))

    }

  def takedownImage = withLoginRedirect { implicit request =>
    val imageId = request.body.asFormUrlEncoded.flatMap(_.get("imageId").flatMap(_.headOption))
    Redirect(controllers.routes.ImageTakedownController.index(imageId)).flashing("success" -> "Image takedown request submitted successfully.")
  }
}
