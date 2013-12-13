package com.gu.mediaservice.integration

import java.net.URL
import java.io.File
import java.util.concurrent.Executors
import scala.sys.props
import scala.concurrent.duration._
import scala.concurrent._
import scala.util.Try

import org.slf4j.LoggerFactory
import play.api.libs.ws.WS
import play.api.http.{ContentTypeOf, Writeable}
import play.api.libs.ws.Response

import uritemplate._
import Syntax._

import com.gu.mediaservice.lib.json._


trait TestHarness {

  final val NotFound = 404
  final val Forbidden = 403
  final val OK = 200
  final val Accepted = 202

  lazy val log = LoggerFactory.getLogger(getClass)

  def config: Config

  def devConfig : Option[Config] =
    for (l <- props.get("loader.uri"); m <- props.get("mediaapi.uri"))
    yield Config(new URL(l), new URL(m))

  val testStackConfig = Config(new URL("https://loader.media.test.dev-***REMOVED***"),
                               new URL("https://api.media.test.dev-***REMOVED***"))

  val apiKeyHeader = ("X-Gu-Media-Key", props("integration.api.key"))

  implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newSingleThreadExecutor)

  def loadImage(file: File): Response = await() {
    WS.url(config.imageLoadEndpoint)
      .withHeaders("Content-Type" -> "image/jpeg")
      .post(file)
  }

  def getRoot: Response = await() {
    WS.url(config.mediaApiEndpoint).withHeaders(apiKeyHeader).get
  }

  def searchImages(query: String): Response = await() {
    WS.url(searchUri(query)).withHeaders(apiKeyHeader).get
  }

  def getImage(id: String): Response = await() {
    WS.url(imageUri(id)).withHeaders(apiKeyHeader).get
  }

  def deleteImage(id: String): Response = await() {
    WS.url(config.imageEndpoint(id)).withHeaders(apiKeyHeader).delete()
  }

  def resourceAsFile(path: String): File =
    new File(getClass.getResource(path).toURI)

  def deleteIndex: Response = await() {
    log.info("Deleting index to clean up")
    WS.url(config.deleteIndexEndpoint).withHeaders(apiKeyHeader).post()
  }

  def linkTemplate(rel: String): Option[URITemplate] = {
    for {
      mediaApiLinks <- array(getRoot.json \ "links")
      imageLink     <- mediaApiLinks.find(l => string(l \ "rel") == Some(rel))
      imageEndpoint <- string(imageLink \ "href")
    } yield URITemplate(imageEndpoint)
  }

  def imageUri(id: String): String = {
    val imageTemplate = linkTemplate("image") getOrElse sys.error("No link found for image")
    imageTemplate expand ("id" := id)
  }

  def searchUri(query: String): String = {
    val searchTemplate = linkTemplate("search") getOrElse sys.error("No link found for search")
    searchTemplate expand ("q" := query)
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
