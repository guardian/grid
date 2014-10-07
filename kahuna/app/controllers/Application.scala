package controllers

import play.api.mvc.Controller
import lib.Config
import com.gu.mediaservice.lib.auth._


// TODO: retire Panda entirely from kahuna, let the JS app and the APIs manage auth

object Application extends Controller with PanDomainAuthActions {

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)

  def index(ignored: String) = Authenticated.async(keyStore)(sendForAuth(_)) { req =>
    Ok(views.html.main(mediaApiUri = Config.mediaApiUri, principal = req.user))
  }

}
