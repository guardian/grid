package controllers

import scala.concurrent.ExecutionContext
import ExecutionContext.Implicits.global
import play.api.mvc.Security.AuthenticatedBuilder

import play.api.mvc._
import play.api.mvc.Results._
import play.api.libs.json.Json
import play.api.libs.openid.{OpenIDError, OpenID}

object RedirectToLogin {
  def apply(request: RequestHeader) = Redirect(routes.Login.loginAction).withSession {
    request.session + ("loginFromUrl", request.uri)
  }
}

case class User(openid: String, email: String, firstName: String, lastName: String) {
  def fullName = firstName + " " + lastName
  def emailDomain = email.split("@").last
}

object User {
  val KEY = "identity"
  implicit val formats = Json.format[User]
  def readJson(json: String) = Json.fromJson[User](Json.parse(json)).get
  def writeJson(id: User) = Json.stringify(Json.toJson(id))
  def fromRequest(request: RequestHeader): Option[User] =
    request.session.get(KEY).map(User.readJson)
}

object Authenticated extends AuthenticatedBuilder(req => User.fromRequest(req), RedirectToLogin(_))

object Login extends Controller {
  val validator = new AuthorisationValidator {
    def emailDomainWhitelist = Seq("theguardian.com", "***REMOVED***")
  }

  val openIdAttributes = Seq(
    ("email", "http://axschema.org/contact/email"),
    ("firstname", "http://axschema.org/namePerson/first"),
    ("lastname", "http://axschema.org/namePerson/last")
  )

  def login = Action { request =>
    val error = request.flash.get("error")
    Ok(views.html.login(error))
  }

  def loginAction = Action.async { request =>
    val secureConnection = request.headers.get("X-Forwarded-Proto").exists(_ == "https")
    OpenID.redirectURL("https://www.google.com/accounts/o8/id",
      routes.Login.openIDCallback.absoluteURL(secureConnection)(request), openIdAttributes)
        .map(Redirect(_))
        .recover { case t =>
            Redirect(routes.Login.login).flashing("error" -> s"Unknown error: ${t.getMessage}:${t.getCause}")
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
        Redirect(routes.Login.login)
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
        Redirect(routes.Login.login).flashing("error" -> (message)
        )
      }
    }
  }

  def logout = Action { implicit request =>
    Redirect(routes.Login.login).withNewSession
  }
}

trait AuthorisationValidator {
  def emailDomainWhitelist: Seq[String]
  def isAuthorised(id: User) = authorisationError(id).isEmpty
  def authorisationError(id: User): Option[String] =
    if (!emailDomainWhitelist.isEmpty && !emailDomainWhitelist.contains(id.emailDomain))
      Some(s"The e-mail address domain you used to login (${id.email}) is not in the configured whitelist.  Please try again with another account or contact the administrator.")
    else
      None
}
