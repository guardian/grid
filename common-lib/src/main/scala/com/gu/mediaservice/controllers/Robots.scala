package controllers

import play.api.mvc._

object Robots extends Controller {

  def disallowAll = Action {
    Ok("User-agent: *\nDisallow: /\n")
  }

}
