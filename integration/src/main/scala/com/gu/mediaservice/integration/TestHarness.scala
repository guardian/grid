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

  final val NotFound = 404
  final val Forbidden = 403
  final val OK = 200
  final val Accepted = 202

  lazy val log = LoggerFactory.getLogger(getClass)

  def config: Config

  implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newSingleThreadExecutor)

  def loadImage(file: File): Response = await() {
    WS.url(config.imageLoadEndpoint)
      .withHeaders("Content-Type" -> "image/jpeg")
      .post(file)
  }

  def getImage(id: String): Response = await() {
    WS.url(config.imageEndpoint(id)).get
  }

  def deleteImage(id: String): Response = await() {
    WS.url(config.imageEndpoint(id)).delete()
  }

  def resourceAsFile(path: String): File =
    new File(getClass.getResource(path).toURI)

  def deleteIndex: Response = await() {
    log.info("Deleting index to clean up")
    WS.url(config.deleteIndexEndpoint).post()
  }

  def retrying[A](desc: String, attempts: Int = 10, sleep: Duration = 3.seconds)(f: => A): A = {
    def iter(n: Int, f: => Try[A]): Try[A] =
      if (n <= 0) {
        log.error(s""""$desc" failed after $attempts attempts""")
        f
      }
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
