package com.gu.mediaservice.integration

import java.io.File
import java.util.concurrent.Executors
import scala.concurrent.duration._
import scala.concurrent._
import scala.util.{Failure, Try}

import org.slf4j.LoggerFactory
import play.api.libs.ws.{WS, Response}
import play.api.http.{ContentTypeOf, Writeable}


trait TestHarness {

  lazy val log = LoggerFactory.getLogger(getClass)

  lazy val config = Discovery.discoverConfig("media-service-TEST") getOrElse sys.error("Could not find stack")

  implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newSingleThreadExecutor)

  def loadImage(id: String, file: File): Response = await() {
    WS.url(config.imageLoadEndpoint(id).toExternalForm)
      .withHeaders("Content-Type" -> "image/jpeg")
      .put(file)
  }

  def getImage(id: String): Response = await() {
    WS.url(config.imageEndpoint(id).toExternalForm).get
  }

  def resourceAsFile(path: String): File =
    new File(getClass.getResource(path).toURI)

  def deleteIndex: Future[Response] = {
    log.info("Deleting index to clean up")
    WS.url(config.deleteIndexEndpoint.toExternalForm).post()
  }

  def retrying[A](desc: String, attempts: Int = 5, sleep: Duration = 3.seconds)(f: => A): A = {
    def iter(n: Int, f: => Try[A]): Try[A] =
      if (n <= 0) Failure(sys.error(s"$desc failed after $attempts attempts"))
      else f.orElse {
        log.warn(s"""Retrying "$desc" in $sleep""")
        Thread.sleep(sleep.toMillis)
        iter(n-1, f)
      }
    iter(attempts, Try(f)).get
  }

  def await[A](timeout: Duration = 15.seconds)(a: Awaitable[A]): A =
    Await.result(a, timeout)

  implicit val unitWriteable: Writeable[Unit] = Writeable(_ => Array(), None)
  implicit val unitContentType: ContentTypeOf[Unit] = ContentTypeOf(None)

}
