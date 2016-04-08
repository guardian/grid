package controllers

import java.net.URI

import scala.concurrent.Future

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._

import play.api.libs.json._

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._

import lib.{Config, ControllerHelper}


case class AppIndex(name: String, description: String, config: Map[String, String] = Map())
object AppIndex {
  implicit def jsonWrites: Writes[AppIndex] = Json.writes[AppIndex]
}

object MediaLeaseController extends Controller with ArgoHelpers {

  import lib.Config.rootUri

  def uri(u: String) = URI.create(u)
  val leasesUri = uri(s"$rootUri/lease")

  val appIndex = AppIndex("media-leases", "Media leases service")
  val indexLinks = List(Link("leases", leasesUri.toString))

  val Authenticated = ControllerHelper.Authenticated

  def index = Authenticated { _ => respond(appIndex, links = indexLinks) }

  def putLease(id: String) = Authenticated.async { request =>
    Future { NotImplemented }
  }

  def deleteLease(id: String) = Authenticated.async { request =>
    Future { NotImplemented }
  }

  def getLease(id: String) = Authenticated.async { request =>
    Future { NotImplemented }
  }
}
