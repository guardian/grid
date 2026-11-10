package com.gu.mediaservice

import com.amazonaws.services.lambda.runtime.events.SQSEvent
import com.amazonaws.services.lambda.runtime.{Context, RequestHandler}
import com.fasterxml.jackson.databind.ObjectMapper
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient

import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.logging.Logger
import scala.jdk.CollectionConverters._
import scala.util.{Failure, Success, Try}

class ImageCachePurgerHandler extends RequestHandler[SQSEvent, String] {

  private val fastlyServiceId = requiredEnvironmentVariable("FASTLY_SERVICE_ID")
  private val fastlyMediaHost = requiredEnvironmentVariable("FASTLY_MEDIA_HOST")
  val imageCachePurger = new ImageCachePurger(
    new FastlyPurger(FastlyApiKeyProvider.default, fastlyServiceId, fastlyMediaHost)
  )

  private val logger = Logger.getLogger(classOf[ImageCachePurger].getName)

  private def requiredEnvironmentVariable(name: String): String =
    sys.env.get(name).map(_.trim).filter(_.nonEmpty)
      .getOrElse(throw new IllegalStateException(s"$name is not set"))

  override def handleRequest(input: SQSEvent, context: Context): String = {
    imageCachePurger.handleRecord(input).fold(
      exception => {
        logger.severe(s"Failed to purge keys from Fastly: ${exception.getMessage}")
        throw exception
      },
      _ =>  "Image cache purge requested")

  }
}

class ImageCachePurger(fastlyPurger: FastlyPurger) {
  private val logger = Logger.getLogger(classOf[ImageCachePurger].getName)

  def handleRecord(input: SQSEvent): Try[Unit] = {
    val keys = input.getRecords.asScala.toList.flatMap { record =>
      ImageCachePurger.extractKeys(record.getBody)
    }

    keys.foldLeft(Try(())) { (result, key) =>
      for {
        _ <- result
        _ <- fastlyPurger.purge(key)
      } yield ()
    } match {
      case Success(_) =>
        logger.info(s"Successfully purged ${keys.size} keys from Fastly")
        Success(())
      case Failure(exception) =>
        logger.severe(s"Failed to purge keys from Fastly: ${exception.getMessage}")
        Failure(exception)
    }
  }
}


object ImageCachePurger {
  private val objectMapper = new ObjectMapper()

  private[mediaservice] def extractKeys(messageBody: String): List[String] = {
    objectMapper.readTree(messageBody).path("Records").elements().asScala.map { record =>
      val key = record.path("s3").path("object").path("key").asText()
      URLDecoder.decode(key, StandardCharsets.UTF_8)
    }.toList
  }

  private[mediaservice] def extractSecret(secretString: String): String = {
    objectMapper.readTree(secretString).path("FASTLY_API_KEY_SECRET_ID").asText()
  }
}
