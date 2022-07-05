package lib

import play.api.mvc.{Result, Results}

import scala.concurrent.Future

case class Paging(page: Int, from: Int, pageSize: Int)

object Paging extends Results {
  def withPaging(maybePage: Option[Int])(f: Paging => Future[Result]): Future[Result] = {
    val pageSize = 250
    // pages are indexed from 1
    val page = maybePage.getOrElse(1)
    val from = (page - 1) * pageSize

    if (page < 1) {
      Future.successful(BadRequest(s"Value for page parameter should be >= 1"))
    } else {
      f(Paging(page, from, pageSize))
    }
  }
}
