package com.gu.mediaservice

import java.net.URL

import com.gu.mediaservice.lib.auth.provider.ApiKeyAuthentication
import com.gu.mediaservice.lib.config.{ServiceHosts, Services}
import com.gu.mediaservice.lib.metadata.ImageMetadataConverter
import com.gu.mediaservice.model._
import com.typesafe.scalalogging.LazyLogging
import org.joda.time.DateTime
import play.api.libs.ws.{WSClient, WSRequest}

import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}

object ImageDataMergerConfig {

  def apply(apiKey: String, domainRoot: String, imageLoaderEndpointOpt: Option[String])(implicit wsClient: WSClient, ec: ExecutionContext): ImageDataMergerConfig = {
    val services = new Services(domainRoot, ServiceHosts.guardianPrefixes, Set.empty)
    val imageLoaderEndpoint = imageLoaderEndpointOpt match {
      case Some(uri) => uri
      case None => services.loaderBaseUri
    }
    new ImageDataMergerConfig(apiKey, services, imageLoaderEndpoint)
  }
}

case class ImageDataMergerConfig(apiKey: String, services: Services, imageLoaderEndpoint: String)(implicit wsClient: WSClient, ec: ExecutionContext) extends ApiKeyAuthentication {
  val gridClient: GridClient = GridClient(services)(wsClient)
}

object ImageProjectionOverrides extends LazyLogging {


  private def handleEmptyString(entry: Option[String]): Option[String] = entry.collect { case x if x.trim.nonEmpty => x }

}

trait FullImageProjectionResult

case class FullImageProjectionSuccess(image: Option[Image]) extends FullImageProjectionResult

case class FullImageProjectionFailed(message: String, downstreamErrorMessage: String) extends FullImageProjectionResult

object ImageDataMerger extends LazyLogging {
  def aggregate(image: Image, gridClient: GridClient, authFunction: WSRequest => WSRequest)(implicit ec: ExecutionContext): Future[Image] = {
    logger.info(s"starting to aggregate image")
    val mediaId = image.id
    // NB original metadata should already be added, cleaned, and copied to metadata.
    for {
      collections <- gridClient.getCollections(mediaId, authFunction)
      edits <- gridClient.getEdits(mediaId, authFunction)
      leases <- gridClient.getLeases(mediaId, authFunction)
      usages <- gridClient.getUsages(mediaId, authFunction)
      crops <- gridClient.getCrops(mediaId, authFunction)
    } yield {
      val updatedImage = image.copy(
        collections = collections,
        userMetadata = edits,
        leases = leases,
        usages = usages,
        exports = crops,
        metadata = ImageDataMerger.mergeMetadata(edits, image.metadata),
        usageRights = edits.flatMap(e => e.usageRights).getOrElse(image.usageRights)
      )
      val inferredLastModified = ImageDataMerger.inferLastModifiedDate(updatedImage)
      updatedImage.copy(
        // userMetadataLastModified is that from edits, falling back to the inferred
        userMetadataLastModified = edits.flatMap(_.lastModified).orElse(inferredLastModified),
        // main last modified is always inferred
        lastModified = inferredLastModified
      )
    }
  }

  /** This is the highest last modified of any date we know in the image */
  def inferLastModifiedDate(image: Image): Option[DateTime] = {
    val dtOrdering = Ordering.by((_: DateTime).getMillis())

    val exportsDates = image.exports.flatMap(_.date)
    val collectionsDates = image.collections.map(_.actionData.date)
    val usagesDates = image.usages.map(_.lastModified)
    val metadataEditDate = image.userMetadata.flatMap(_.lastModified)

    val allDatesForUserEditableFields = image.leases.lastModified ++
      exportsDates ++
      collectionsDates ++
      usagesDates ++
      metadataEditDate

    allDatesForUserEditableFields match {
      case Nil => None
      case dates => Some(dates.max(dtOrdering))
    }
  }

  private def mergeMetadata(edits: Option[Edits], originalMetadata: ImageMetadata) = edits match {
    case Some(Edits(_, _, metadata, _, _, _)) => originalMetadata.merge(metadata)
    case None => originalMetadata
  }

  def apply(config: ImageDataMergerConfig): ImageDataMerger = {
    import config._

    // Authorise with api key
    def authFunction = (request: WSRequest) => request.withHttpHeaders((apiKeyHeaderName, apiKey))

    new ImageDataMerger(gridClient, services, authFunction, imageLoaderEndpoint)

  }

}

class ImageDataMerger(gridClient: GridClient, services: Services, authFunction: WSRequest => WSRequest, imageLoaderEndpoint: String) extends ApiKeyAuthentication with LazyLogging {

  def getMergedImageData(mediaId: String)(implicit ec: ExecutionContext): FullImageProjectionResult = {
    try {
      val maybeImageFuture = getMergedImageDataInternal(mediaId)
      val mayBeImage: Option[Image] = Await.result(maybeImageFuture, Duration.Inf)
      FullImageProjectionSuccess(mayBeImage)
    } catch {
      case e: DownstreamApiInBadStateException =>
        FullImageProjectionFailed(e.getMessage, e.getDownstreamMessage)
    }
  }

  private def getMergedImageDataInternal(mediaId: String)(implicit ec: ExecutionContext): Future[Option[Image]] = for {
    maybeStubImage <- gridClient.getImageLoaderProjection(mediaId, imageLoaderEndpoint, authFunction)
    image <- getFullMergedImageData(maybeStubImage)
  } yield image

  private def getFullMergedImageData(maybeImage: Option[Image])(implicit ec: ExecutionContext): Future[Option[Image]] = maybeImage match {
    case Some(image) =>
      // TODO I'm suspicious that we don't invoke the cleaners on this pass...
      val imageWithMetadata = image.copy(originalMetadata = ImageMetadataConverter.fromFileMetadata(image.fileMetadata))
      ImageDataMerger.aggregate(imageWithMetadata, gridClient, authFunction) map (i => Some(i))
    case None => Future.successful(None)
  }

  def isValidApiKey(implicit ec: ExecutionContext): Future[Boolean] = {
    // Make an API key authenticated request to the leases API as a way of validating the API key.
    // A 200/404 indicates a valid key.
    // Using leases because its a low traffic API.
    class BadApiKeyException extends Exception
    import com.gu.mediaservice.GridClient.{Found, NotFound, Error}
    gridClient.makeGetRequestAsync(new URL(services.leasesBaseUri), authFunction) map {
      case Found(_, _) => true
      case NotFound(_, _) => true
      case Error(_, _, _) => false
    }
  }

}

