package controllers

import com.gu.mediaservice.lib.auth.{Authentication, BaseControllerWithLoginRedirects}
import com.gu.mediaservice.lib.config.Services
import lib.LiveContentApi
import play.api.mvc.ControllerComponents

class ImageTakedownController(override val auth: Authentication,
                              override val services: Services,
                              override val controllerComponents: ControllerComponents
                             ) extends BaseControllerWithLoginRedirects {

    def index(imageId: Option[String]) = withLoginRedirect { implicit request =>
        Ok(views.html.imageTakedown(imageId, List("1", "2")))
    }

  def takedownImage = withLoginRedirect { implicit request =>
    val imageId = request.body.asFormUrlEncoded.flatMap(_.get("imageId").flatMap(_.headOption))
    Redirect(controllers.routes.ImageTakedownController.index(imageId)).flashing("success" -> "Image takedown request submitted successfully.")
  }
}
