package controllers

import play.api.mvc.{Action, Controller}
import play.api.libs.openid.{OpenIDError, OpenID}
import play.api.libs.concurrent.Execution.Implicits._
import com.gu.mediaservice.lib.auth.User


object Login extends Controller {

  object validator {
    type AuthorisationError = String
    val emailDomainWhitelist = Seq("theguardian.com", "guardian.co.uk")
    def isAuthorised(id: User): Boolean = emailDomainWhitelist.contains(id.emailDomain)
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
      val attr = info.attributes.get _
      val credentials =
        for (email <- attr("email"); firstName <- attr("firstname"); lastName <- attr("lastname"))
        yield User(info.id, email, firstName, lastName)
      credentials match {
        case Some(user) if validator.isAuthorised(user) =>
          Redirect(session.get("loginFromUrl").getOrElse("/"))
            .withSession (session + (User.KEY -> User.writeJson(user)) - "loginFromUrl")
        case _ =>
          Redirect(routes.Login.loginForm)
            .flashing("error" -> "Authorisation failed.")
            .withSession(session - User.KEY)
      }
    } recover {
      case t =>
        val message = t match {
          case e: OpenIDError => "Failed to login (%s): %s" format (e.id, e.message)
          case other => "Unknown login failure: %s" format t.toString
        }
        Redirect(routes.Login.loginForm).flashing("error" -> message)
    }
  }

  def logout = Action {
    Redirect(routes.Login.loginForm).withNewSession
  }

}
