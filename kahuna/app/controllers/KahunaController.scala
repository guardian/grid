package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import lib.KahunaConfig
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.ExecutionContext

class KahunaController(config: KahunaConfig, override val controllerComponents: ControllerComponents, assets: Assets)(implicit val ec: ExecutionContext) extends BaseController with ArgoHelpers {

  def index(ignored: String) = Action { req =>
    val okPath = routes.KahunaController.ok.url
    // If the auth is successful, we redirect to the kahuna domain so the iframe
    // is on the same domain and can be read by the JS
    val returnUri = config.rootUri + okPath
    Ok(views.html.main(
      config.mediaApiUri,
      config.authUri,
      s"${config.authUri}/login?redirectUri=$returnUri",
      config.watUri,
      config.sentryDsn,
      config.sessionId,
      assets
    ))
  }

  def ok = Action { implicit request =>
    Ok("ok")
  }
}
