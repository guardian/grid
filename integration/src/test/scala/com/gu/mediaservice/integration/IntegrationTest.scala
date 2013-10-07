package com.gu.mediaservice
package integration

import java.io.File
import java.util.concurrent.Executors
import scala.concurrent._
import scala.concurrent.duration._
import scala.util.Success

import org.slf4j.LoggerFactory
import org.scalatest.FlatSpec
import play.api.libs.ws.{Response, WS}
import scalaz.syntax.bind._
import scalaz.Monad
import play.api.http.{ContentTypeOf, Writeable}
import play.api.libs.json.JsString


class IntegrationTest extends FlatSpec {

  private val log = LoggerFactory.getLogger("IntegrationTest")

  lazy val config = Discovery.discoverConfig("media-service-TEST") getOrElse sys.error("Could not find stack")

  implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newSingleThreadExecutor)

  "An image posted to the loader" should "become visible in the Media API" in {
    await(15.seconds) {

      loadImage("honeybee", resourceAsFile("/images/honeybee.jpg")) >>
      retrying("get image", 5, 3.seconds)(getImage("honeybee")) >>
      deleteIndex

    }
  }

  it should "retain IPTC metadata when retrieved from the Media API" in {

    val response = await(15.seconds) {
      loadImage("gallery", resourceAsFile("/images/gallery.jpg")) >>
      retrying("get image", 5, 3.seconds)(getImage("gallery")) <*
      deleteIndex
    }
    val metadata = response.json \ "metadata"

    assert(metadata \ "credit" == JsString("AFP/Getty Images"))
    assert(metadata \ "byline" == JsString("GERARD JULIEN"))

  }

  def loadImage(id: String, file: File): Future[Response] =
    WS.url(config.imageLoadEndpoint(id).toExternalForm)
      .withHeaders("Content-Type" -> "image/jpeg")
      .put(file)
      .filter(_.status == 204)

  def getImage(id: String): Future[Response] =
    WS.url(config.imageEndpoint(id).toExternalForm).get.filter(_.status == 200)

  def resourceAsFile(path: String): File =
    new File(getClass.getResource(path).toURI)

  def deleteIndex: Future[Response] = {
    log.info("Deleting index to clean up")
    WS.url(config.deleteIndexEndpoint.toExternalForm).post()
  }

  def retrying[A](desc: String, attempts: Int = 10, sleep: Duration)(future: => Future[A]): Future[A] = {
    def iter(n: Int, f: => Future[A]): Future[A] =
      if (n <= 0) Future.failed(new RuntimeException(s"Failed after $attempts attempts"))
      else f.orElse {
          log.warn(s"""Retrying "$desc" in $sleep""")
          Thread.sleep(sleep.toMillis)
          iter(n-1, f)
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

  def await[A](timeout: Duration)(a: Awaitable[A]): A =
    Await.result(a, timeout)

  implicit val futureInstance: Monad[Future] = new Monad[Future] {
    def point[A](a: => A) = Future.successful(a)
    def bind[A, B](fa: Future[A])(f: (A) => Future[B]) = fa flatMap f
  }

  implicit val unitWriteable: Writeable[Unit] = Writeable(_ => Array(), None)
  implicit val unitContentType: ContentTypeOf[Unit] = ContentTypeOf(None)

}
