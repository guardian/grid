package controllers

import play.api.mvc._
import scala.concurrent.duration._

object CorsPreflight extends Controller {

  // cache preflight access control response for one day
  val maxAge = 1.day.toSeconds.toString

  // Handle CORS preflight request
  def options(ignoredUrl: String) = Action {
    Ok("").withHeaders(
      "Access-Control-Allow-Methods" -> "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers" -> "Content-Type, X-Requested-With, Accept",
      "Access-Control-Max-Age" -> maxAge
    )
  }

}
