package controllers

import play.api.mvc.{Action, Controller}
import play.api.libs.openid.{OpenIDError, OpenID}
import play.api.libs.concurrent.Execution.Implicits._
import com.gu.mediaservice.lib.auth.User


object Login extends Controller {

  object validator {

    type AuthorisationError = String
    val emailDomainWhitelist = Seq("theguardian.com", "***REMOVED***")

    def isAuthorised(id: User): Boolean = authorisationError(id).isEmpty

    def authorisationError(id: User): Option[AuthorisationError] =
      if (emailDomainWhitelist.contains(id.emailDomain))
        None
      else
        Some(s"The e-mail address domain you used to login (${id.email}) is not in the configured whitelist." +
          s"Please try again with another account or contact the administrator.")
  }

  val openIdAttributes = Seq(
    ("email", "http://axschema.org/contact/email"),
    ("firstname", "http://axschema.org/namePerson/first"),
    ("lastname", "http://axschema.org/namePerson/last")
  )

  def loginForm = Action { request =>
    val error = request.flash.get("error")
    Ok(views.html.login(error))
  }

  def doLogin = Action.async { implicit request =>
    val secureConnection = request.headers.get("X-Forwarded-Proto").exists(_ == "https")
    OpenID.redirectURL("https://www.google.com/accounts/o8/id",
      routes.Login.openIDCallback.absoluteURL(secureConnection), openIdAttributes)
        .map(Redirect(_))
        .recover { case t =>
          Redirect(routes.Login.loginForm)
            .flashing("error" -> s"Unknown error: ${t.getMessage}:${t.getCause}")
        }
  }

  def openIDCallback = Action.async { implicit request =>
    OpenID.verifiedId map { info =>
      val credentials = User(
        info.id,
        info.attributes.get("email").get,
        info.attributes.get("firstname").get,
        info.attributes.get("lastname").get
      )
      if (validator.isAuthorised(credentials)) {
        Redirect(session.get("loginFromUrl").getOrElse("/"))
          .withSession (session + (User.KEY -> User.writeJson(credentials)) - "loginFromUrl")
      } else {
        Redirect(routes.Login.loginForm)
          .flashing("error" -> validator.authorisationError(credentials).get)
          .withSession(session - User.KEY)
      }
    } recover {
      case t => {
        // Here you should look at the error, and give feedback to the user
        val message = t match {
          case e:OpenIDError => "Failed to login (%s): %s" format (e.id, e.message)
          case other => "Unknown login failure: %s" format t.toString
        }
        Redirect(routes.Login.loginForm).flashing("error" -> message)
      }
    }
  }

  def logout = Action {
    Redirect(routes.Login.loginForm).withNewSession
  }

}
