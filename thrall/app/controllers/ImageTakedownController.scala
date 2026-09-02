package controllers

import com.gu.mediaservice.lib.auth.{Authentication, Authorisation, BaseControllerWithLoginRedirects}
import com.gu.mediaservice.lib.config.Services
import play.api.mvc.ControllerComponents

class ImageTakedownController(override val auth: Authentication,
                              override val services: Services, override val controllerComponents: ControllerComponents) extends BaseControllerWithLoginRedirects {

    def index = withLoginRedirect {
        Ok(views.html.imageTakedown())
    }


}
