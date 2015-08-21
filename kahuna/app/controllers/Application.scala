package controllers

import play.api.mvc.{Action, Controller}
import lib.Config

object Application extends Controller {

  def index(ignored: String) = Action { req =>
    Ok(views.html.main(
      Config.mediaApiUri,
      Config.watUri,
      Config.mixpanelToken,
      Config.sentryDsn))
  }

  // FIXME: Hack to serve asset under the erroneous URL it is requested at
  def hackJcropGif(ignored: String) = {
    Assets.at(path="/public", file="jspm_packages/github/tapmodo/Jcrop@0.9.12/css/Jcrop.gif")
  }

}
