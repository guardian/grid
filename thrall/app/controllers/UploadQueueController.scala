package controllers
import com.gu.mediaservice.lib.auth.{Authentication, BaseControllerWithLoginRedirects}
import com.gu.mediaservice.lib.logging.GridLogging
import scala.concurrent.{ExecutionContext, Future}
import play.api.mvc.{ControllerComponents, BaseController}
import com.gu.mediaservice.lib.config.Services

class UploadQueueController(override val controllerComponents: ControllerComponents)
 extends BaseController with GridLogging {


  def reportAll = Action {
    Ok("no report implmented")
  }


}
