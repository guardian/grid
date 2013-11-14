package controllers

import play.api.mvc._

object CorsPreflight extends Controller {

  // Handle CORS preflight request
  def options(url: String) = Action {
    Ok("").withHeaders(
      "Access-Control-Allow-Methods" -> "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers" -> "Content-Type, X-Requested-With, Accept",
      // cache access control response for one day
      "Access-Control-Max-Age" -> (60 * 60 * 24).toString
    )
  }

}
