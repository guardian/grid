package com.gu.mediaservice.integration

import java.io.File
import java.util.concurrent.Executors
import scala.concurrent.duration._
import scala.concurrent._
import scala.util.Success

import org.slf4j.LoggerFactory
import play.api.libs.ws.{WS, Response}
import play.api.http.{ContentTypeOf, Writeable}
import scalaz.{Bind, Monad}
import scalaz.syntax.bind._

trait TestHarness {

  lazy val log = LoggerFactory.getLogger("IntegrationTest")

  lazy val config = Discovery.discoverConfig("media-service-TEST") getOrElse sys.error("Could not find stack")

  implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newSingleThreadExecutor)

  def loadImage(id: String, file: File): Future[Response] =
    WS.url(config.imageLoadEndpoint(id).toExternalForm)
      .withHeaders("Content-Type" -> "image/jpeg")
      .put(file)
      .flatMap { response =>
        if (response.status != 204) Future.failed(new RuntimeException(response.statusText))
        else Future.successful(response)
      }

  def getImage(id: String): Future[Response] =
    WS.url(config.imageEndpoint(id).toExternalForm).get

  def resourceAsFile(path: String): File =
    new File(getClass.getResource(path).toURI)

  def deleteIndex: Future[Response] = {
    log.info("Deleting index to clean up")
    WS.url(config.deleteIndexEndpoint.toExternalForm).post()
  }

  def retrying[A](desc: String, attempts: Int = 5, sleep: Duration = 3.seconds)(future: => Future[A]): Future[A] = {
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

  implicit class BindSyntax[F[_]: Bind, A](self: F[A]) {
    def << [B](fb: => F[B]): F[A] = self >>= (a => fb >| a)
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
