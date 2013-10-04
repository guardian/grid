package com.gu.mediaservice
package integration

import java.io.File
import scala.concurrent.{ExecutionContext, Promise, Future, Await}
import scala.concurrent.duration._
import org.scalatest.FlatSpec
import play.api.libs.ws.{Response, WS}
import scala.util.Success
import java.util.concurrent.Executors


class IntegrationTest extends FlatSpec {

  implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newSingleThreadExecutor)

  "An image posted to the loader" should "become visible in the Media API" in {

    Await.result(

      loadImage("honeybee", resourceAsFile("/images/honeybee.jpg")).flatMap(_ =>
        retrying(5, 2000)(getImage("honeybee"))
      ),

      10.seconds
    )

  }

  def loadImage(id: String, file: File): Future[Response] =
    WS.url(Config.imageLoadEndpoint(id).toExternalForm)
      .withHeaders("Content-Type" -> "image/jpeg")
      .put(file)
      .filter(_.status == 204)

  def getImage(id: String): Future[Response] =
    WS.url(Config.imageEndpoint(id).toExternalForm).get.filter(_.status == 200)

  def resourceAsFile(path: String): File =
    new File(getClass.getResource(path).toURI)


  def retrying[A](attempts: Int, sleep: Int)(future: => Future[A]): Future[A] = {
    def iter(n: Int, f: => Future[A]): Future[A] =
      f.orElse {
        if (n <= 0) Future.failed(new RuntimeException(s"Failed after $attempts attempts"))
        else iter(n-1, {
          println(s"Retrying in $sleep ms...")
          Thread.sleep(sleep)
          f
        })
      }
    iter(attempts, future)
  }

  implicit class FutureSyntax[A](self: Future[A]) {
    /** Non-strict version of Future#fallbackTo */
    def orElse(that: => Future[A]): Future[A] = {
      val p = Promise[A]()
      self.onComplete {
        case s @ Success(_) => p complete s
        case _ => p completeWith that
      }
      p.future
    }
  }

}
